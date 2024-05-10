# Backstrap Server 3 (BS3)

## Table of Contents
- [Changes In BS3](#changes-from-bs-classic-to-bs3)
- [Overview](#overview)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [On First Launch](#on-first-launch)
- [Create a New Endpoint/Controller](#create-a-new-endpoint/controller)
- [Security](#security)
- [Custom Injectables](#custom-injectables)
- [Multi-Part-Form-Data](#multi-part-form-data)
- [Additional Features](#additional-features)
## Changes from BS Classic to BS3:
BS3 (backstrap-server 3.0.0) represents a major breaking change from versions 1 & 2.  A conversion guide will be available at some point in the future.  The new version was built to be lighter, faster, and easier to maintain.  Here are the primary differences:

#### __Javascript Classes__
Rather than relying on .prototype, BS3 uses true classes.  This means that your controller files will need to be formatted with this in mind.  See the example below or check out /node_modules/backstrap-server/common/analytics_1_0_0.js in your project to see a simple version.

#### __Async/Await__
BS3 supports native promises (BS classic relied on Q).  This means you can use async/await or .then() syntax (or mix-and-match).

#### __Data & Utility Services__
BS Classic has data services, but BS3 allows you to define a directory for utility services and another for data services.  Specify the directory you will use for utility or data services in __Settings.json__ with the properties `data_service_directory` and `utilities_directory`, and BS3 will automatically load any files it finds there into the utilities or dataAccess modules making them available in your controller files as `dataAccess.my_service.some_function()` and `utilities.my_service.some_function()` respectively.

#### __onInit.js__
We added a place to execute arbitrary code after BS3 has started up.  Anything your system may need to do on startup can be included here.

#### __expressSettings.js__
BS3 is capable of modifying certain common settings in Express through use of __Settings.json__, but if you need finer-grained control, `app` is passed into this file/function so you can add `.use()` statements.

#### __Settings Syntax__
In BS Classic, you accessed the properties of Settings.json by using `settings.data.MY_PROPERTY`.  This is now `settings.MY_PROPERTY` but you can no longer add arbitrary properties to that file.

#### __Endpoints_ext.json is now Endpoints.json__
BS Classic used __Endpoints.json__ for internal endpoints made __Endpoints_ext.json__ available to the user.  BS3 give the user __Endpoints.json__ to modify and relegates internal endpoints to another file.

#### __config/ is now dbconfig/__
The connection information for your db is stored in dbconfig files `dbconfig/dbconfig.local.js`, `dbconfig/dbconfig.development.js`, etc corresponding to your various environments.  Aside from the name change, the only difference is the removal of a "bucket" property which is no used in BS3. 

#### __DB Tables__
The tables used by BS3 and the structure of these tables is a departure form BS Classic.  The new BS3 managed tables are:
- __bs3_users__
- __bs3_credentials__
- __bs3_sessions__

#### Web Console Removed
The web console was removed entirely.  Instead,  modify the json files for __Endpoints__, __Settings__, & __Security__ directly.
Users should be added or modified using the built-in endpoints or through the functions in accessControl.js
The initial user used to bootstrap other admin users(`bsroot`) is now assigned a generic password until you change it.  BS Classic relied on the web console to setup a password for this user.

#### __ORM Removed__
The ORM system relied heavily on JSONB fields in postgres which meant that table statistics were inaccurate and query times weren't optimal.  And given the limitations on the built-in database object access control system, most users were writing their accessors manually anyway.  So there is no __Models.json__ file and no /common/models endpoints in BS3.



## Overview:
Backstrap Server was built on the premise that there should be a clear line between an API's endpoint and the business logic behind it.  The routine tasks in a server-request pipeline such as token validation, access control, and argument verification should be handled automatically so that developers can spend their time writing the code that really matters to your project.

The underlying technologies which power Backstrap Server are Nodejs, Express, and Postgresql.  The requests you will deal with in your controllers are raw Express requests, so their properties will be familiar.  Backstrap simply runs all the processing you would ordinarily have to handle yourself.  By the time a request hits your controller, you can be sure that it has the proper arguments and was sent by an authenticated user.

To accomplish this task, Backstrap Server manages its own tables in an Postgresql >= v9 database.  This includes bs3_users, bs3_credentials, and bs3_sessions data. 

You will also find a number of common endpoints which are ready to go out-of-the-box.  These include the basic functions of any API such as sign in/out, sign up, forgot/reset password and more.  Also there are a number of utility functions available to the methods of your controllers.


## Quick Start
__Make Sure You Have Everything Running__
- Make sure you have node installed
- Make sure you have postgres >- 9.4 installed and running
- Make sure you have npm installed

__Create The Database__
+ If you do not have a database for this project, create one in postgres 
    - In PSQL run:
        `create database [YOUR DB NAME]`

__Install And Run Backstrap Server__
- Go to project root
- Run `npm init`
- Run `npm install --save backstrap-server`
- Copy the contents of [Project Root]/node_modules/backstrap-server/user_files/ and paste them to [Project Root]/
- Open [Project Root]/config/config.local.js 
    - Enter the name of your db user 
    - Enter the database to use
    - Enter the password for that db/user pair.
    - Save
- Open [Project Root]/Settings.json
    - Enter a value for the "token_header"  (ie. myapp_api_token)
    - Save  
    - This is the name of the http header which Backstrap will use for auth
- Open [Project Root]/package.json
    - In the "scripts" object, add the following entry:
	      `"start": "node index.js"`
    - Save
- Run npm start
    - The server should start up and show it's initialization process on the command line.


__Setup First User__
On startup, the system checks for the user `bsroot` and if it does not find it, a new super-user is created in that name with password `abcd@1234`.

__CHANGE THIS PASSWORD IMMEDIATELY AND DO NOT DELETE THAT USER IN THE FUTURE!__

bsroot is a super-user capable of creating accounts with any permissions and those credentials should be treated with care. 


## Project Structure:
There are five types of files used in Backstrap projects. 

__Core files__ are those used by the framework and which require no modifications by the developer.  These are the files included in the npm package included in `node_modules/backstrap-server`.  Some of these you will likely interact with such as utilities.js (which contains some useful common functions) and dataAccess.js (which has functions for reading and writing to the db), but others require no conscious interaction such as controller.js (which routes requests to the proper method in its corresponding controller file) and BackstrapServer.js (which starts up the server and initializes everything).  Here is a full list:
```
/common
accessControl.js
BackstrapServer.js
base64.js
controller.js
dataAccess.js
Endpoints_in.json
endpoints.js
ErrorObj.js
jwt.js
schemaControl.js
serviceRegistration.js
settings.js
utilities.js
```

*NOTE: These files are overwritten in Backstrap Server updates.  Any changes you make will be clobbered.


__Extension files__ are editable files which extend some of the Core files.  accessControl.js, dataAccess.js, and utilities.js are injected into controller files on instantiation, and you can add your own functions to these classes using accessControl_ext.js, dataAccess_ext.js, and utilities_ext.js.  Those functions will then be available by calling this.accessControl.extension.yourFunction(), this.dataAccess.extension.yourFunction(), or this.utilities.extension.yourFunction().
There is more information on using Extension files in following sections.


__Data & Utility Services__ are user defined files injected into `dataAccess` and `utilities` respectively.  Functions you add to your service files will be available by calling this.dataAccess.yourServiceFile.yourFunction() or this.utilities.yourServiceFile.yourFunction().
There is more information on using Services files in following sections.


__Configuration files__ include
- `Settings.json` - the fundamentals: server port, timeout, auth headers, email account options, etc.
- `Security.json` - define user roles for the api and what areas, controllers, methods each role may access.
- `Endpoints_in.json / Endpoints.json` - describes all API endpoints and their parameters.

All of these files are editable except `Endpoints_in.json`.  Instead use `Endpoints.json`.  There is more specific information on Configuration files in following sections.


__Controller files__ are where the code for each endpoint is defined.  The name and location of these files is specified by the endpoints they define.  All endpoints in Backstrap Server are of the format {BASE_URL}/{AREA}/{CONTROLLER}/{METHOD}/{CONTROLLER VERSION} and the corresponding controller file would be found at the path [PROJECT ROOT]/[AREA]/[CONTROLLER]_[VERSION].  For example, the endpoint http://basedomain.com/myArea/myController/myMethod/1.0.0 would be defined in a file at the path [PROJECT ROOT]/myArea/myController_1_0_0.js.
There is more specific information on creating and editing Controller files in later sections.

---

## Getting Started
### Prerequisites
Backstrap requires both __Node.js__ and __npm__ to run, as well as, the object-relational database system __PostgreSQL__.

---

#### Installing Node.js

If you're using OS X or Windows, the best way to install Node.js is to use one of the installers from the [Node.js download page](https://nodejs.org/en/download/). If you're using Linux, you can use the installer, or you can check NodeSource's binary distributions to see whether or not there's a more recent version that works with your system.

To test run: `node -v`. The version should be higher than v0.10.32.

#### Updating npm

Node comes with npm installed so you should have a version of npm. However, npm gets updated more frequently than Node does, so you'll want to make sure it's the latest version.
```
npm install npm@latest -g
```
To test run: `npm -v`. The version should be higher than 2.1.8.

#### Installing/Setup PostgreSQL

###### Mac OS X via Homebrew:

Install [__Homebrew__](https://brew.sh/) to `/usr/local` using the following command:
```
mkdir homebrew && curl -L https://github.com/Homebrew/brew/tarball/master | tar xz --strip 1 -C homebrew
```

Once the installation is successful run `brew doctor`.

Install __PostgreSQL__ using the following command:
```
$ brew install postgresql
```
Postgres can be trickier to start on mac as it does not automatically create the default postgres user.

Run `$ psql`.  If you get an error like `psql: FATAL: database {yourusername} does not exist`, you need to create the default database for you user.

To fix this, run `$ createdb`.

Run `$ psql` again and you should enter the Postgres CLI for your user. Run `$ \q` to exit.


###### Linux:
The default repositories contain PostgreSQL packages, so we can install these easily using the `apt` packaging system.
```
$ sudo apt-get updated
$ sudo apt-get install postgresql postgresql-contrib
```
###### Windows:
 1. Download and run the [Windows PostgreSQL one click installer].
 2. Install PostgreSQL as a Windows Service
 3. Keep track of the __PostgreSQL Windows Service__ account name and password. LabKey Server doesn't really care what this password is set to, but we need to ask for it so that we can pass it along to the PostgreSQL installer.
 4. Keep track of the __database superuser__ name and password. You'll need these to configure LabKey Server. LabKey Server uses this password to authenticate itself to PostgreSQL.
 5. Select the PL/pgsql procedural language for installation when prompted by the installer.
---


### Install and Run Backstrap Server:
You can install Backstrap Server either by checking out the git repository (https://github.com/Lookfar-Backstrap/backstrap) or by using npm (npm install --save backstrap-server), and depending which route you select, your project root will be organized differently.

### Using git:
Once you've checked out the repository, you'll have a project root with many of the Core, Configuration, and Extension files all mixed together.  This method of installing is useful if you intend to work on/contribute code to the Backstrap Server open-source project, or if you expect to heavily modify the Core files and do not intend to update your version of Backstrap.  Here is what your project root will contain:
```
/common — Core controllers with the logic for all out-of-the-box endpoints.
/dbconfig — Configuration files with connection information for the Postgresql database
/node_modules — Npm controlled directory with dependencies
/templates — html and txt templates used for system generated emails.
/uploads — default directory for files uploads

accessControl_ext.js — Extension file for accessControl.js
accessControl.js — Core file with functions related to user permission
BackstrapServer.js — Main Core file.  Runs initialization of all components.
base64.js — Core file base64 codec.  Does not handle header info, just pure base64 data.
controller.js — Core file handling routing of Express requests to the correct controller file and method based on url
dataAccess_ext.js — Extension file for dataAccess.js
dataAccess.js — Core file for dealing with database reading/writing.
Endpoints.json — Configuration file holding info on endpoints you have defined (non-system-generated endpoints)
endpoints.js — Core file which manipulates and exposes the data in Endpoints_in.json/Endpoints.json to the rest of the system.
Endpoints_in.json — Core/Configuration file with information on out-of-the-box endpoints
ErrorObj.js — Core file definition of the general error class in Backstrap.
expressSettings.js - Extension file with direct access to Express for adding .use() statements
jwt.js - used for decoding jwts when using an identity service
LICENSES.txt — Standard MIT license
onInit.js - User-defined startup script
package.json — NPM configuration file
schemaControl.js — Core file for managing the tables in the Postgresql database.
Security.json — Configuration file for defining user roles and permissions
serviceRegistration.js — Core file handling checks that a request is hitting a valid endpoint and that arguments are valid
settings.js — Core file which manipulates and exposes the data in Settings.json
Settings.json — Configuration file with general server settings such as session timeout and default port
utilities_ext.js — Extension file for utilities.js
utilities.js — Core file with general functions useful across all controllers
```

Before starting up the server, you'll need to add some connection info for the database you want Backstrap to use.  In the `/dbconfig` directory, you'll see three files:

- dbconfig.development.js
- dbconfig.local.js
- dbconfig.production.js

They all have the same format, but depending on the environment variable NODE_ENV detected by the system, it will select the matching connection info.  This lets you change from your development server to your prod server by just restarting after changing your environment variables.  If NODE_ENV isn't found or doesn't match 'development', 'local', or 'production', the system will default to 'local' and use `dbconfig.local.js`.  Here is `dbconfig.local.js` as it comes out-of-the-box:
```
module.exports = {
 db: {
   user: process.env.DB_USER || '[YOUR DB USER HERE]',
   name: process.env.DB_NAME || '[YOUR DB NAME HERE]',
   pass: process.env.DB_PASS || '[YOUR DB PASSWORD HERE]',
   host: process.env.DB_HOST || 'localhost',
   port: process.env.DB_PORT || '5432'
 }
};
```
Fill in the required information the database you plan to use.  Don't worry about setting up any tables, as Backstrap will spool up everything it needs automatically to get going (assuming your postgres user permissions permit this).

Check your package.json file to make sure the npm start script will run `node BackstrapServer.js`.  And finally run `npm start` to launch the server.


### Using npm:
In general, this is the preferred method for using Backstrap Server.  It will keep your project root clean and allows for easy updates to the core system.

From your blank project root, run `npm install -s backstrap-server`.
Navigate to [PROJECT ROOT]/node_modules/backstrap-server/user_files
Copy all files from that directory and past them in your project root.
Your project root should now look like this:
```
/.ebextensions — This hold scripts that will be used when deploying to Amazon's Elastic Beanstalk
/config — Configuration files with connection information for the Postgresql database and default S3  bucket (if running the server in distributed mode—more on that later).
/node_modules — Npm controlled directory with dependencies

accessControl_ext.js — Extension file for accessControl.js
dataAccess_ext.js — Extension file for dataAccess.js
Endpoints.json — Extension/Configuration file holding info on endpoints you have defined (non-system-generated endpoints)
expressSettings.js - includes function to configure Express directly (rather than through config files)
index.js — Core main file.  Just kicks off the BackstrapServer.js code.
onInit.js - custom startup script
package.json — NPM configuration file
Security.json — Configuration file for defining user roles and permissions
Settings.json — Configuration file with general server settings such as session timeout and default port
utilities_ext.js — Extension file for utilities.js
```
As you can see, the only files in the project root are Configuration and Extension files, so you are only presented with those files which you can edit.

Just as with the git installation, you now need to set up the connection to your Postgresql database.  Using the file in /config that corresponds to your NODE_ENV environment variable (or using the default config.local.js file) fill in the required information to connect to the db.  See the section on installing with git for further information on the /config directory and files.
Check that the start script in package.json runs `node index.js`
Run `npm start` to launch the server.


## On First Launch:
If Backstrap detects no users in the database, it assumes this is the initial launch and will automatically create a single user account with username `bsroot`.  This user has the role of `super-user` and can be used to bootstrap other admin/super-user accounts for you and your support team.  The password for this initial user is `abcd@1234`.

__CHANGE THIS PASSWORD IMMEDIATELY AND DO NOT DELETE THAT USER IN THE FUTURE!__

bsroot is a super-user capable of creating accounts with any permissions and those credentials should be treated with care. 

## Create a New Endpoint/Controller
As stated previously, the location and name of the controller file within the larger project is based on the endpoints it serves.  So let's make an endpoint for:
```
[BASE_URL]/newArea/newController/newMethod/1.0.0
```

First we need to create a directory in the project root that matches the area name.  So in this case we will create an empty directory in project root called 'newArea'.
Next, we need to create a controller file within our new directory which matches both the name and version number specified in the endpoint using the format:

[CONTROLLER_NAME]_[CONTROLLER_MAJOR_VERSION]_[CONTROLLER_MINOR_VERSION]_[CONTROLLER_PATCH_VERSION].js
So in our case, that will be `newController_1_0_0.js`.  We now have a correctly named controller file in the correct area directory (/newArea/newController_1_0_0.js).

Now it's time to look at the format of Controller files.  Here is the skeleton for our controller file newController_1_0_0.js

```
class NewController {
  constructor(da, utils, ac, sr, st) {
    this.dataAccess = da;
    this.utilities = utils;
    this.accessControl = ac;
    this.serviceRegistration = sr;
    this.settings = st;

    this.get = {};
    this.post = {
      myMethod: this.#processMyMethod.bind(this)
    };
    this.patch = {};
    this.put = {};
    this.delete = {};
  }

  async #processMyMethod(req) {
    return new Promise(async (resolve, reject) => {
      // do some async stuff
      // and then resolve or reject
      resolve({success: true});
    });
	}
}

module.exports = NewController;

```

So we instantiate a class with a constructor that allows Backstrap Server to inject some of its files for use in all controllers.  We have already given a general idea of what dataAccess, utilities, and accessControl do.  The others you will see are serviceRegistration which provides access to metadata about the endpoint, and settings which provides programmatic access to the general settings of the server from `Settings.json`.  You certainly do not need to use all of these, but they will be passed into the constructor of controller files regardless.

It does not matter what you name the class internally, but the file name must match the controller section of the endpoint.  

Now our controller is defined and set up, it's time to register our new endpoint with the system by manually editing the `Endpoints.json` file.  The web console approach should be fairly straightforward, but let's take a quick look at the `Endpoints.json` Configuration file.  When you first get setup, this file should contain an empty object {}.  Within this object you will add key/value pair for each area where the key is the name of the area and the value is an array of objects describing the various controllers in that area.  To get started, here's what we would enter for our area and controller:
```
{
  "newArea": [
    {
      "name": "newController",
      "version": "1.0.0",
      "methods": []
    }
  ]
}
```
That defines our area and controller for the system, but we still need to add a definition for our new method that includes the http verb, method name, description, whether a user must be authenticated with an api token when making the request, and the argument names/types.  Let's say that our endpoint is a GET request with single, string argument called `id` which is required.  Our `Endpoints.json` file will be updated to:
```
{
  "newArea": [
    {
      "name": "newController",
      "version": "1.0.0",
      "methods": [
        {
          "verb": "GET",
          "call": "newMethod",
          "desc": "get some data from the api",
          "authRequired": false,
          "args": [
            "name": "id",
            "type": "string",
            "isRequired": true
          ],
          "isUserCreated": true
        }
      ]
    }
  ]
}
```
With that, we have defined the method including its arguments.  The system will now recognize GET /newArea/newController/newMethod/1.0.0 as a valid endpoint and will check for the existence of the required argument `id` as well as its type to make sure it matches the definition.

__NOTE__: The "isUserCreated" flag will be true for all endpoints defined in `Endpoints.json`.

We are now set to define the actual logic of our endpoint.  So back in `/newArea/newController_1_0_0.js` we can create the new method.

```
class NewController {
  constructor(da, utils, ac, sr, st) {
    this.dataAccess = da;
    this.utilities = utils;
    this.accessControl = ac;
    this.serviceRegistration = sr;
    this.settings = st;

    this.get = {};
    this.post = {
      newMethod: this.#processNewMethod.bind(this)
    };
    this.patch = {};
    this.put = {};
    this.delete = {};
  }

  async #processNewMethod(req) {
    return new Promise(async (resolve, reject) => {
      var idArg = req.query.id;
      var successResponse = true;
      var jsonResponseObj = {id: idArg};
      if(successResponse) {
            resolve(jsonResponseObj);
      }
      else {
        reject(new ErrorObj(500, 
                            'myErrorCode001', 
                            __filename, 
                            'GET newMethod', 
                            'internal error description', 
                            'external error description', 
                            {someKey: 'someVal'}));
      }
    });
	}
}

module.exports = NewController;
```

Backstrap will look in the controller under the block defined by http verb.  Since our new method is a GET endpoint, we need to define the method as a kv-pair in that object (as above).  All endpoint controller methods include the Express request as input parameter.  Name the method the same as the method name from the endpoint url.  Ours is called `newMethod` from /newArea/newController/newMethod/1.0.0.
We create a promise at the beginning, use denodeify with the callback specified on input, and return the promise at the end.  Since `req` is an Express request, you will find the arguments supplied in the request at req.query or req.body depending on the http verb used in the request.  Also, you can be sure of the existence and type-match of the argument `id` as that was checked by the framework before the request arrives at the controller.

Upon resolve or reject of the promise in the method, Express will fire off the response to the request.

__NOTE__: For authenticated requests, Backstrap will append to the req input a parameter named `this_user` which contains the basic account information on the user making the request.
\
&nbsp;

### Backstrap Error Object:
In the method defined above, we are simply responding with the id argument supplied in the request.  But you can also see how we would return an error:

```
reject(new ErrorObj(500, 
                    'myErrorCode001', 
                    __filename, 
                    'GET newMethod', 
                    'internal error description', 
                    'external error description', 
                    {someKey: 'someVal'}));
```

The ErrorObj includes an http status which the server will return as well as information about where the error originated and any messaging you wish to apply.  The last argument is meant to hold any other payload data you may want in an error response.  Importantly, if you put a Backstrap ErrorObj in the payload section, the framework will automatically build a stack of functions called when the error was generated.  

Additional functions such as `updateError()` and `setMessage()` are available on the error object to control what is returned to the user.

You can look through the Controller files in /common/ or read through /ErrorObj.js to get a sense of how to use the onboard error system.
\
&nbsp;

### Versioning:
In the previous example, we created the endpoint /newArea/newController/newMethod/1.0.0.  But let's say that has been deployed and we have a version of a mobile app using that endpoint.  We want our next version of the mobile app to use an updated version of our endpoint, but we need to keep the original version running as part of legacy support.  Backstrap Server supports versioning of controller files, so all we would need to do is create a new Controller file named `/newArea/newControler_1_0_1.js` and register a new controller and method in `Endpoints_ext.json`.  `Endpoints_ext.json` would now look like:
```
{
  "newArea": [
    {
      "name": "newController",
      "version": "1.0.0",
      "methods": [
        {
          "verb": "GET",
          "call": "newMethod",
          "desc": "get some data from the api",
          "authRequired": false,
          "args": [
            "name": "id",
            "type": "string",
            "isRequired": true
          ],
          "isUserCreated": true
        }
      ]
    }
    {
      "name": "newController",
      "version": "1.0.1",
      "methods": [
        {
          "verb": "GET",
          "call": "newMethod",
          "desc": "get some data from the api v1.0.1",
          "authRequired": false,
          "args": [
            "name": "id",
            "type": "string",
            "isRequired": true
          ],
          "isUserCreated": true
        }
      ]
    }
  ]
}
```

With that, we have defined /newArea/newController/newMethod/1.0.1 which will run alongside /newArea/newController/newMethod/1.0.0.

__NOTE__: You can leave out the version entirely from the URL when making a request and the system will use the latest version it can find of the corresponding controller.  This is, however, a questionable practice if you intend on keeping certain versions of your front end attached to certain versions of the API methods.

---

## Security
### User Types, Sessions, & Authenticated Requests

There are 3 user types in Backstrap.

- `Native` users have a username and password.  Those users sign in with their credential and receive a token.  The name of the token is dependent on the property `token_header` in Settings.json.  By default, this is set to `"bs_api_token"`.  In subsequent calls to the API, the token should be included as a header with the same name.  So authenticated calls would include a header `bs_api_token: TOKEN RETURNED BY SIGN IN`.  All requests with that token are included in a single session in the system.

- `API` users have an email, a client_id, and a client_secret.  This type of user leverages Basic Auth.  The token is computed by combining `client_id + ":" + client_secret`, encoding as base64 and prepending "Basic".  In pseudocode, it's `"Basic " + encodeAsBase64(client_id + ":" + client_secret)`.  This type of user includes the basic auth header in all request and lacks all session tracking (since there is no signing in or signing out).

- `External` users rely on a 3rd party service (only Auth0 at the moment) to handle authentication.  The external service provdes a JWT to the user who can either swap that for a backstrap header token (if logical sessions are required), or include that JWT in subsequent calls.

#### Sessions
If you use backstrap header tokens to handle sessions there are a handful of properties in Settings.json of interest.  They are `token_header`, `timeout_check`, and `timeout`.  By default, their values are:
```
{
  "token_header": "bs_api_token",
  "timeout_check": 15,
  "timeout": 120
}
```
This tells the framework that API tokens for authenticated requests can be found in a header called `bs_api_token`, that it should check for user sessions which have timed out every 15 minutes, and that a session which is idle for 120 minutes should be considered dead.  Of course, all three of the parameters are editable by you.  It is best practice to immediately rename your token_header to something specific to your project.  For example, we could change to:
```
{
  "token_header": "myProj_api_token",
  "timeout_check": 15,
  "timeout": 120
}
```
And now the framework will expect that API tokens will be found in a header called `myProj_api_token`.

You obtain that token by using the out-of-the-box endpoint /common/accounts/signIn/1.0.0 which if successful returns the token as a parameter of the response or through a custom endpoint that leverages AccessControl.signIn().

### Permissions
That explains how to make an authenticated requests, but you may not want all authenticated users to have access to the same endpoints.  For example, you may have an endpoint designed for admins which retrieves information on any user in the system based on name.  You certainly do not want your standard users to have the ability to get private information about each other.  The framework handles this by using endpoint level permissions based on user role.  You can define a new user role (super-user, admin-user, and default-user are set up out-of-the-box), and then assign either whole areas, whole controllers, or specific methods from specific controllers in specific areas as valid endpoints for that role.  This is accomplished in the Security.json file.  Initially, the file looks like this:
```
{
   "roles": [
       {
           "name": "super-user",
           "title": "Super User",
           "description": "This is a super user. They can do everything!",
           "areas": [
               {
                   "name": "common",
                   "permission": "all"
               }
           ]
       },
       {
           "name": "admin-user",
           "title": "Admin User",
           "description": "This is an admin user. They can do some stuff!",
           "areas": [
               {
                   "name": "common",
                   "permission": "some",
                   "validRoutes": [
                       {
                           "controller": "accounts",
                           "permission": "all",
                           "version": "1.0.0"
                       },
                       {
                           "controller": "analytics",
                           "permission": "all",
                           "version": "1.0.0"
                       },
                       {
                           "name": "cms",
                           "permission": "all",
                           "version": "1.0.0"
                       }
                   ]
               }           
  ]
       },
       {
           "name": "default-user",
           "title": "Default User",
           "description": "This is a default user. They can do some stuff!",
           "areas": [
               {
                   "name": "common",
                   "permission": "some",
                   "validRoutes": [
                       {
                           "controller": "accounts",
                           "version": "1.0.0",
                           "permission": "all"
                       },
                       {
                           "controller": "analytics",
                           "version": "1.0.0",
                           "permission": "all"
                       },
                       {
                           "name": "cms",
                           "permission": "all"
                       }
                   ]
               }
           ]
       }
   ]
}
```
As you can see, there is an object for each user role with a name, title, and description.  The actual specification of permissions takes place in the "areas" array.  Each area to which a user role has some permissions should appear as an object with properties `name` and `permission`.  If you are granting permission to an entire area, you can just fill out the object like this:
```
{
  "name": "newArea",
  "permissions": "all"
}
```
If you are granting permissions to specific controllers in that area, it will look like this:
```
{
  "name": "newArea",
  "permissions": "some",
  "validRoutes": [
    {
      "controller": "newController",
      "permissions": "all",
      "version": "1.0.0"
    }
  ]
}
```
If you are granting permissions to a specific method within a specific controller within a specific area, it will look like this:
```
{
  "name": "newArea",
  "permissions": "some",
  "validRoutes": [
    {
      "controller": "newController",
      "permissions": "some",
      "version": "1.0.0",
      "methods": [
        {
          "verb": "GET",
          "call": "newMethod"
        }
      ]
    }
  ]
}
```

---

## Custom Injectables 
### Extensions Files, Data Services, & Utility Services
As you saw in the explanation of Controller files, a number of dependencies are injected into controllers.  BS3 offers a few options to add your own functions to these dependencies so you can use them in your controllers.  `dataAccess.js`, `utilities.js`, and `accessControl.js` are all injected into all controllers and are used as the vehicle to include your own code.  These three classes contain the framework's functions for reading/writing in the db, general functions useful in all controllers, and functions related to permissions.  
\
&nbsp;
### Extension Files
BS3 projects include `dataAccess_ext.js`, `utilities_ext.js`, and `accessControl_ext.js` in the user-editable files.  They are nearly identical, so we will looks only at `dataAccess_ext.js`.  When a project is started, `dataAccess_ext.js` will look like this:

```
class DataAccessExtension {
  constructor(da) {
    this.dataAccess = da;
  }

// SAMPLE QUERY
// async SomeQuery() {
//  return new Promise(async (resolve, reject) => {
// 	  var qry = "SELECT * FROM person WHERE person.id = $1";
// 	  var qry_params = [1];
//    try {
// 	    let person_res = await this.dataAccess.ExecutePostgresQuery(qry, qry_params, null);
// 		  // do something with person...
//      resolve(person_res);
//    }
//    catch(err) {
//      reject(err);
//    }
//  })
// }

}

module.exports = DataAccessExtension;
```
You can see from the sample query how this system works.  You add public functions to the class like 'SomeQuery()', and they will become available in your controllers at dataAccess.extension.YOUR_FUNCTION (eg. `dataAccess.extensions.SomeQuery()`).  The same is true for `utilites_ext.js` and `accessControl_ext.js`.  Functions defined in those files will be available in controllers at `utilities.extension.YOUR_FUNCTION()` and `accessControl.extension.YOUR_FUNCTION()`.
\
&nbsp;
### Data Services & Utilities Directories
To enable a data services directory in your project, add the following line to your Settings.json file:
```
data_service_directory: path/to/directory/from/project/root
```

To enable a utilities directory in your project, add the following line to your Settings.json file:
```
utilities_directory: path/to/directory/from/project/root
```

On startup, Backstrap Server will attempt to instantiate each file in those directories and inject them into `dataAccess` or `utilities` respectively.  These files must be typical javascript classes as demonstrated below.

Data Service
```
class myDataService {
  constructor(da, u) {
    this.dataAccess = da;
    this.utilities = u;
  }

  async someFunction(someArg) {
    return new Promise(async (resolve, reject) => {
      try {
        // ... do something
      }
      catch(err) {
        // ... failed.  reject promise
      }
    })
  }
  
}
module.exports = myDataService;
```

If setup correctly, your method will be accessible with `dataAccess.myDataService.someFunction()`.


Utility Service
```
class myUtility {
  constructor(u) {
    this.utilities = u;
    this.dataAccess = u.dataAccess;
  }

  async someFunction(someArg) {
    return new Promise(async (resolve, reject) => {
      try {
        // ... do something
      }
      catch(err) {
        // ... failed.  reject promise
      }
    });
  }
}
module.exports = myUtility;
```

Again, if setup correctly, your method will be accessible with `utilities.myUtility.someFunction()`.

__NOTE__: The constructors for data services & utilities take slightly different arguments.

---

## Multi-Part-Form-Data
BS3 supports JSON and Multi-Part-Form-Data requests.  To attach a file or files as multi-part-form-data, put the byte stream in a multi-part-form-data field called `mpfd_files`.  On requests that include a file stream, you can access them at req.files from your controller.

---

## Additional Features:
Backstrap Server includes some other features to make development simpler.  For example, you can use the mail settings in Settings.json, the mail methods in utilities.js, and the text and html templates in /templates to generate all sorts of system emails.  These include variable replacement so you can include user-specific information in your system emails.  It relies on the npm package node-mailer and has integrations with a number of popular email services.  It has been tested extensively with SendGrid.

We will be updating this section of the readme with other additional features.  Check back with us to see this new documentation.

---

Send questions to __backstrap@lookfar.com__