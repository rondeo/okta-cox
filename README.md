# Okta-Cox PoC #

## Overview ##
This rep shows several Okta flows for Cox. It is a Node.js app.

The live version of this app is [here](https://okta-cox.herokuapp.com).

## Flows ##

Three flows are provided. In the app, the list of flows is available by clicking on "Cox Communications" in the upper-left corner.

1. Self-registration for "never customer" users: users are able to self-register, and are placed in a "never customers" group in Okta.

* the path for this flow is: /never_customer_register
* users who register via this path are placed in the following group: `never_customers`
* the user is automatically authenticated after registering, and the Okta widget recognizes the user's session
* the registration happens via SDK/API.
* to see the code for the registration, look at the

```app.post('/never_customer_register'...```

block.

* the code is using the Okta [Node.js SDK](https://github.com/okta/okta-sdk-nodejs) to create the user.
* the code is using the Okta [authentication SDK](https://github.com/okta/okta-auth-js)to authenticate the user.
* the Okta widget lives on the front-end, and handles recognizing the user session, and login/logout.

2. Self-registration for "regular customer" users: users are able to self-register, and are placed in a "regular customers" group in Okta.

This flow is provided primarily to show contrast with the "never customer" flow.

The code is identical to the never customer flow, with the exception of the group id that users are assigned to.

```app.post('/regular_user_register'...```

3. "Plain" authentication with the Okta widget: a baseline flow for allowing users to authenticate and get an Okta session.

## Reviewing the code ##

### Front end ###
The web pages in ther app are built on-the-fly using a custom engine. So, if you want to see what's going on in the front end, it's best just view the source of the page. If you want to add another page to the app, you can work with Okta to create a new dynamically generated page, or just copy an existing page and add it to the `/public` directory.

### Back end ###
The post routes are included in the main `app.js` file.

### Configuration ###
The app makes heavy use of the `dotenv` package to abstract as much configuration out of the app as possible. If you are loading this app on local host or some other server, copy the `.env_example` file to a file called `.env` to make those values available to yourt app.
