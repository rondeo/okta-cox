////////////////////////////////////////////////////

require('dotenv').config()

const bodyParser = require('body-parser')

const express = require('express')

const fs = require('fs')

const hbs = require('hbs')

const okta = require('@okta/okta-sdk-nodejs')

const OktaAuth = require('@okta/okta-auth-js')

const request = require('request')

///////////////////////////////////////////////////

// SET UP WEB SERVER
const app = express()

var port = process.env.PORT

app.listen(port, function () {
	console.log('App listening on port ' + port + '...');
})

app.use(bodyParser.json())

app.use(bodyParser.urlencoded({ extended: false }))

app.use(express.static('public'))

///////////////////////////////////////////////////

var settings = {}

///////////////////////////////////////////////////

// Load all settings from settings.json
// Use any values from process.env to overwrite settings

var settings = require('./config/settings.json')

for (var param in settings) {

	settings[param]["loaded_from"] = "settings.json"

	if (process.env.hasOwnProperty(param)) {
		settings[param]["val"] = process.env[param]
		settings[param]["loaded_from"] = "process.env"
	}
}

console.log("The settings loaded from settings.json and process.env are:")
console.dir(settings)
console.log("***********************************************************")

///////////////////////////////////////////////////

// Load all default partials into partials object

var partials_path = process.cwd() + '/partials'

var default_path = partials_path + '/default'

var partials = require('./config/default_partials.json')

for (var partial in partials) {

	partials[partial]["loaded_from"] = "default"

	var this_path = default_path + '/' + partial + '.hbs'

	partials[partial]["val"] = fs.readFileSync(this_path, 'utf8')
}

console.log("The partials loaded from default_partials.json are:")
console.dir(partials)
console.log("***********************************************************")

///////////////////////////////////////////////////

// Load metadata about the flows

var flows_metadata = require('./config/flows_metadata.json')

console.log("The flows metadata is:")
console.dir(flows_metadata)
console.log("***********************************************************")

///////////////////////////////////////////////////

// Load the flows whitelist

var arr = settings.FLOWS.val.split(', ')

flows_whitelist = []

arr.forEach(function(flow) {

	var f = flow.replace("'", "") 	// delete ' from flow_name
	f = f.replace('"', "")			// delete " from flow_name

	flows_whitelist.push(f)
})

console.log("the flows_whitelist is:")

console.dir(flows_whitelist)

///////////////////////////////////////////////////

app.set('view engine', 'hbs')

///////////////////////////////////////////////////

app.get('/', function (req, res, next) {
	res.redirect('/home')
})

// short-circuit requests to /favicon.ico
app.get('/favicon.ico', function (req, res, next) {
	res.set('Content-Type', 'image/x-icon')
	res.sendStatus(200)
})

app.get('/:flow', function (req, res, next) {

	const flow = req.params.flow

	// first, check to see if we've got a valid flow name.
	if (flows_whitelist.indexOf(flow) === -1) {
		res.send("sorry, '" + flow + "' is either not a valid flow name, or not whitelisted for this demo.")
	}

	console.log("the flow is: " + flow)

	var required_settings = flows_metadata[flow]["required_settings"]

	var my_settings = {}
	var loaded_from = {}

	for (var param in settings) {

		console.log("looking at setting " + param)

		if (	settings[param]["load"] ||
				settings[param]["loaded_from"] === "process.env" ||
				required_settings.includes(param)
			) {
			my_settings[param] = settings[param]["val"]
			loaded_from[param] = settings[param]["loaded_from"]
			console.log("loaded setting " + param + " from " + settings[param]["loaded_from"])
		}
		else {
			console.log("did not load setting " + param)
		}
	}

	///////////////////////////////////////////////////

	// load default partials

	var required_partials = flows_metadata[flow]["required_partials"]

	console.log("\n***************************")
	console.log("loading default partials...")

	for (var partial in partials) {

		console.log("looking at partial " + partial)

		console.log("the value of partial.load is: " + partials[partial].load)

		if (partials[partial]["load"]) {
			hbs.registerPartial(partial, partials[partial]["val"])
			loaded_from[partial] = "default_partials"
			console.log("loaded value from default_partials.json")
		}
		else {
			console.log("not loaded by default...")

			if (required_partials.includes(partial)) {

				hbs.registerPartial(partial, partials[partial]["val"])
				loaded_from[partial] = "required_partials"
				console.log("loaded value from default_partials.json because it's a required partial")
			}
			else {
				console.log("not in the list of required partials for this flow...")
			}
		}
		console.log("--------")
	}

	///////////////////////////////////////////////////

	// load local partials

	var my_dir = './partials/' + flow

	if (fs.existsSync(my_dir)) {

		fs.readdirSync(my_dir).forEach(file => {

			console.log("found local partial " + file);

			var arr = file.split(".hbs")

			var this_partial_name = arr[0]

			var this_partial_content = fs.readFileSync(my_dir + '/' + file, 'utf8')

			hbs.registerPartial(this_partial_name, this_partial_content)
		})
	}
	else {
		console.log("WARNING: no local directory found for flow " + flow)
	}

	my_settings["TITLE"] = settings["TITLE_BASE"]["val"] + ": " + flows_metadata[flow]["friendly_name"]
	my_settings["REDIRECT_URI"] = process.env.REDIRECT_URI + "/" + flow

	if (flow === "home") {

		var links = []

		flows_whitelist.forEach(function(some_flow) {

			if (some_flow != "home") {
				links.push({
					uri: "/" + some_flow,
					// name: some_flow + ": " + flows_metadata[some_flow].friendly_name
					name: flows_metadata[some_flow].friendly_name
				})
			}
		})

		my_settings["links"] = links
	}

	console.dir(my_settings)

	res.render('main', my_settings)

})

app.post('/register_via_api', function (req, res, next) {

	console.log("the req body is: ")
	console.dir(req.body)

	var data = {
		profile: {
			firstName: req.body.firstName,
			lastName: req.body.lastName,
			email: req.body.email,
			login: req.body.email
		},
		credentials: {
			password: {
				value: req.body.password
			}
		}
	}

	const client = new okta.Client({
		orgUrl: process.env.OKTA_TENANT,
		token: process.env.OKTA_API_TOKEN
	})

	client.createUser(data)
	.then(user => {
		console.log('Created user', user)

		var config = {
			url: process.env.OKTA_TENANT
		}

		var authClient = new OktaAuth(config)

		authClient.signIn({
			username: req.body.email,
			password: req.body.password
		})
		.then(function(transaction) {
			if (transaction.status === 'SUCCESS') {
				console.log(transaction.sessionToken)

				var url = process.env.OKTA_TENANT + "/login/sessionCookieRedirect?token="
				url += transaction.sessionToken
				url += "&redirectUrl=" + process.env.REDIRECT_URI + "/register_via_api"

				res.redirect(url)

			} else {
				throw 'We cannot handle the ' + transaction.status + ' status';
			}
		})
		.fail(function(err) {
			console.error(err);
		});
	})
})

app.post('/register_via_api_post_group_id', function (req, res, next) {

	console.log("the req body is: ")
	console.dir(req.body)

	var data = {
		profile: {
			firstName: req.body.firstName,
			lastName: req.body.lastName,
			email: req.body.email,
			login: req.body.email
		},
		credentials: {
			password: {
				value: req.body.password
			}
		},
		groupIds: [
			process.env.GROUP01_ID
		]
	}

	console.log("the reg object is: ")
	console.dir(data)

	const client = new okta.Client({
		orgUrl: process.env.OKTA_TENANT,
		token: process.env.OKTA_API_TOKEN
	})

	client.createUser(data)
	.then(user => {
		console.log('Created user', user)

		var config = {
			url: process.env.OKTA_TENANT
		}

		var authClient = new OktaAuth(config)

		authClient.signIn({
			username: req.body.email,
			password: req.body.password
		})
		.then(function(transaction) {
			if (transaction.status === 'SUCCESS') {
				console.log(transaction.sessionToken)

				var url = process.env.OKTA_TENANT + "/login/sessionCookieRedirect?token="
				url += transaction.sessionToken
				url += "&redirectUrl=" + process.env.REDIRECT_URI + "/register_via_api_post_group_id"

				res.redirect(url)

			} else {
				throw 'We cannot handle the ' + transaction.status + ' status';
			}
		})
		.fail(function(err) {
			console.error(err);
		});

	})
})

app.post('/never_customer_register', function (req, res, next) {

	console.log("the req body is: ")
	console.dir(req.body)

	var data = {
		profile: {
			firstName: req.body.firstName,
			lastName: req.body.lastName,
			email: req.body.email,
			login: req.body.email
		},
		credentials: {
			password: {
				value: req.body.password
			}
		},
		groupIds: [
			process.env.NEVER_CUSTOMER_GROUP_ID
		]
	}

	console.log("the reg object is: ")
	console.dir(data)

	const client = new okta.Client({
		orgUrl: process.env.OKTA_TENANT,
		token: process.env.OKTA_API_TOKEN
	})

	client.createUser(data)
	.then(user => {
		console.log('Created user', user)

		var config = {
			url: process.env.OKTA_TENANT
		}

		var authClient = new OktaAuth(config)

		authClient.signIn({
			username: req.body.email,
			password: req.body.password
		})
		.then(function(transaction) {
			if (transaction.status === 'SUCCESS') {
				console.log(transaction.sessionToken)

				var url = process.env.OKTA_TENANT + "/login/sessionCookieRedirect?token="
				url += transaction.sessionToken
				url += "&redirectUrl=" + process.env.REDIRECT_URI + "/never_customer_register"

				res.redirect(url)

			} else {
				throw 'We cannot handle the ' + transaction.status + ' status';
			}
		})
		.fail(function(err) {
			console.error(err);
		});

	})

})

app.post('/regular_user_register', function (req, res, next) {

	console.log("the req body is: ")
	console.dir(req.body)

	var data = {
		profile: {
			firstName: req.body.firstName,
			lastName: req.body.lastName,
			email: req.body.email,
			login: req.body.email
		},
		credentials: {
			password: {
				value: req.body.password
			}
		},
		groupIds: [
			process.env.REGULAR_CUSTOMER_GROUP_ID
		]
	}

	console.log("the reg object is: ")
	console.dir(data)

	const client = new okta.Client({
		orgUrl: process.env.OKTA_TENANT,
		token: process.env.OKTA_API_TOKEN
	})

	client.createUser(data)
	.then(user => {
		console.log('Created user', user)

		var config = {
			url: process.env.OKTA_TENANT
		}

		var authClient = new OktaAuth(config)

		authClient.signIn({
			username: req.body.email,
			password: req.body.password
		})
		.then(function(transaction) {
			if (transaction.status === 'SUCCESS') {
				console.log(transaction.sessionToken)

				var url = process.env.OKTA_TENANT + "/login/sessionCookieRedirect?token="
				url += transaction.sessionToken
				url += "&redirectUrl=" + process.env.REDIRECT_URI + "/regular_user_register"

				res.redirect(url)

			} else {
				throw 'We cannot handle the ' + transaction.status + ' status';
			}
		})
		.fail(function(err) {
			console.error(err);
		});

	})

})

