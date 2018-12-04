## Overview:
Backstrap Server was built on the premise that there should be a clear line between an API's endpoint and the business logic behind it.  The routine tasks in a server-request pipeline such as token validation, access control, and argument verification should be handled automatically so that developers can spend their time writing the code that really matters to your project.

The underlying technologies which power Backstrap Server are Nodejs, Express, and Postgresql.  The requests you will deal with in your controllers are raw Express requests, so their properties will be familiar.  Backstrap simply runs all the processing you would ordinarily have to handle yourself.  By the time a request hits your controller, you can be sure that it has the proper arguments and was sent by an authenticated user.

To accomplish this task, Backstrap Server manages its own tables in an Postgresql >= v9 database.  This includes user, session, and analytics data.  If you choose to make use of the onboard ORM, Backstrap will manage a table for each model in the same db.  As long as there are no naming conflicts, you can create tables and store data in that database manually as well.

You will also find a number of common endpoints which are ready to go out-of-the-box.  These include the basic functions of any API such as sign in/out, sign up, forgot/reset password and a few dozen more.  Also there are a number of utility functions available to the methods of your controllers.

Finally, Backstrap Server includes an onboard web console which allows developers to register/view/edit endpoints and their arguments, register/edit users and permissions, create/view/edit data models and their relationships, and even create/view/edit records in the database.



## Project Structure:
There are four types of files used in Backstrap projects. 

__Core files__ are those used by the framework and which require no modifications by the developer.  Some of these you will likely interact with such as utilities.js (which contains some useful common functions) and dataAccess.js (which has functions for reading and writing to the db), but others require no conscious interaction such as controller.js (which routes requests to the proper method in its corresponding controller file) and BackstrapServer.js (which starts up the server and initializes everything).  Here is a full list:
```
/common
/public
/src
accessControl.js
BackstrapServer.js
backstrapSql.js
base64.js
controller.js
dataAccess.js
endpoints.js
Endpoints.json
entityMethods.js
ErrorObj.js
models.js
schema.js
serviceRegistration.js
settings.js
utilities.js
```

*NOTE: These files are overwritten in Backstrap Server updates.  Any changes you make will be clobbered.


__Extension files__ are editable files which extend some of the Core files.  accessControl.js, dataAccess.js, and utilities.js are injected into controller files on instantiation, and you can add your own functions to these classes using accessControl_ext.js, dataAccess_ext.js, and utilities_ext.js.  Those functions will then be available by calling accessControl.extension.yourFunction(), dataAccess.extension.yourFunction(), or utilities.extension.yourFunction().
You may also notice an additional file with "_ext" in the name Endpoints_ext.json is both an extension file and a configuration file.  It is an extension of Endpoints.json which contains information about the system generated endpoints and it's a configuration file which contains information on endpoints defined by you.
There is more information on using Extension files in following sections.


__Configuration files__ include
- `Settings.json` - the fundamentals: server port, timeout, auth headers, email account options, etc.
- `Security.json` - define user roles for the api and what areas, controllers, methods each role may access.
- `Models.json` - describe your models.
- `Endpoints.json / Endpoints_ext.json` - describes all API endpoints and their parameters.

All of these files are editable except `Endpoints.json`.  Instead use `Endpoints_ext.json`.  There is more specific information on Configuration files in following sections.


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
You can install Backstrap Server either by checking out/forking the git repository (https://github.com/Lookfar-Backstrap/backstrap) or by using npm (npm install -s backstrap-server), and depending which route you select, your project root will be organized differently.

### Using git:
Once you've checked out or forked the repository, you'll have a project root with many of the Core, Configuration, and Extension files all mixed together.  This method of installing is useful if you intend to work on/contribute code to the Backstrap Server open-source project, or if you expect to heavily modify the Core files and do not intend to update your version of Backstrap.  Here is what your project root will contain:
```
/common — Core controllers with the logic for all out-of-the-box endpoints.
/config — Configuration files with connection information for the Postgresql database and default S3  bucket (if running the server in distributed mode—more on that later).
/node_modules — Npm controlled directory with dependencies
/public — Source for the angularjs web console.
/src — Static assets for the angularjs web console.
/templates — html and txt templates used for system generated emails.
/uploads — default directory for files uploads

accessControl_ext.js — Extension file for accessControl.js
accessControl.js — Core file with functions related to user permission
backstrap_errors.txt — Text file for optional logging of errors
BackstrapServer.js — Main Core file.  Runs initialization of all components.
backstrapSql.js — Core file offering methods to create/parse queries of data managed by the ORM in sql-like syntax.
base64.js — Core file base64 codec.  Does not handle header info, just pure base64 data.
controller.js — Core file handling routing of Express requests to the correct controller file and method based on url
dataAccess_ext.js — Extension file for dataAccess.js
dataAccess.js — Core file for dealing with database reading/writing.  Some functions are for use with the onboard ORM, and others allow you to run arbitrary SQL commands.
Endpoints_ext.json — Extension/Configuration file holding info on endpoints you have defined (non-system-generated endpoints)
endpoints.js — Core file which manipulates and exposes the data in Endpoints.json/Endpoints_ext.json to the rest of the system.
Endpoints.json — Core/Configuration file with information on out-of-the-box endpoints
entityMethods.js — Core file which can optionally be used to handle reading/writing using the ORM.
ErrorObj.js — Core file definition of the general error class in Backstrap.
LICENSES.txt — Standard MIT license
models.js — Core file which manipulates and exposes the data in Models.json
Models.json — Configuration file with info on data models defined using the onboard ORM
package.json — NPM configuration file
schema.js — Core file for managing the tables in the Postgresql database.
Security.json — Configuration file for defining user roles and permissions
serviceRegistration.js — Core file handling checks that a request is hitting a valid endpoint and that arguments are valid
settings.js — Core file which manipulates and exposes the data in Settings.json
Settings.json — Configuration file with general server settings such as session timeout and default port
utilities_ext.js — Extension file for utilities.js
utilities.js — Core file with general functions useful across all controllers
```

Before starting up the server, you'll need to add some connection info for the database you want Backstrap to use.  In the `/config` directory, you'll see three files:

- config.development.js
- config.local.js
- config.production.js

They all have the same format, but depending on the environment variable NODE_ENV detected by the system, it will select the matching connection info.  This lets you change from your development server to your prod server by just restarting after changing your environment variables.  If NODE_ENV isn't found or doesn't match 'development', 'local', or 'production', the system will default to 'local' and use `config.local.js`.  Here is `config.local.js` as it comes out-of-the-box:
```
module.exports = {
 db: {
   user: process.env.DB_USER || '[YOUR DB USER HERE]',
   name: process.env.DB_NAME || '[YOUR DB NAME HERE]',
   pass: process.env.DB_PASS || '[YOUR DB PASSWORD HERE]',
   host: process.env.DB_HOST || 'localhost',
   port: process.env.DB_PORT || '5432'
 },
 s3: {
   bucket: '[YOUR BUCKET HERE]'
 }
};
```
If you are running Backstrap Server locally, or on a single server instance (eg. one ec2 instance), you can leave s3.bucket alone.  Fill in the required information the database you plan to use.  Don't worry about setting up any tables, as Backstrap will spool up everything it needs automatically to get going (assuming your postgres user permissions permit this).  If you are running Backstrap Server on a horizontally scaled network of servers, s3.bucket must point to the s3 bucket where you plan to store the Configuration files to which all instances will need access (more on this later).

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
backstrap_errors.txt —
dataAccess_ext.js — Extension file for dataAccess.js
Endpoints_ext.json — Extension/Configuration file holding info on endpoints you have defined (non-system-generated endpoints)
index.js — Core main file.  Just kicks off the BackstrapServer.js code.
Models.json — Configuration file with info on data models defined using the onboard ORM
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
If Backstrap detects no users in the database, it assumes this is the initial launch and will automatically create a single user account with username `bsroot`.  This user has the role of `super-user` and can be used to bootstrap other admin/super-user accounts for you and your support team.  If you use a browser to navigate to `http://[YOUR URL]:[YOUR PORT]` you will be presented with a form for assigning the `bsroot` user a password.  For example, if you are running Backstrap Server locally on the default port, the address you will hit is `http://localhost:3000`.  This is the only user that gets created in this way, all other users must either be entered inside the web console or by using the sign up endpoint.

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
var dataAccess;
var utilities;
var accessControl;
var serviceRegistration;
var settings;
var models;

var Q = require('q');

var Controller = function(da, utils, ac, sr, st, m) {
  dataAccess = da;
  utilities = utils;
  accessControl = ac;
  serviceRegistration = sr;
  settings = st;
  models = m;
};

Controller.prototype.get = {};

Controller.prototype.post = {};

Controller.prototype.put = {};

Controller.prototype.patch = {};

Controller.prototype.delete = {};

exports.newController = Controller;
```

So we instantiate a class with a constructor that allows Backstrap Server to inject some of it's files for use in all controllers.  We have already given a general idea of what dataAccess, utilities, and accessControl do.  The others you will see are serviceRegistration which provides access to metadata about the endpoint, settings which provides programmatic access to the general settings of the server from `Settings.json`, and models which likewise provides programmatic access to metadata on the defined models from the onboard ORM.  You certainly do not need to use all of these, but they will be passed into the constructor of controller files regardless.

It does not matter what you name the class internally, but the exports statement (the very last line) must match the controller file up to the version component.  For example, our controller file is called `newController_1_0_0.js`, so we MUST export the class as `newController`.  This match is case sensitive and your controller will not function if the match is not perfect.  Further, this means you MUST NOT use underscores in controller names.

Now our controller is defined and set up, it's time to register our new endpoint with the system.  This can be accomplished in two ways.  You can log into the web console, navigate to `Endpoints` on the left, and click `Create Endpoint` on the subsequent screen.  This will give you a form that lets you enter the area name, controller name, version, argument names/types, and some descriptions for metadata.  Or you can manually edit the `Endpoints_ext.json` file (which is what the web console does under the hood).  The web console approach should be fairly straightforward, but let's take a quick look at the `Endpoints_ext.json` Configuration file.  When you first get setup, this file should contain an empty object {}.  Within this object you will add key/value pair for each area where the key is the name of the area and the value is an array of objects describing the various controllers in that area.  To get started, here's what we would enter for our area and controller:
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
That defines our area and controller for the system, but we still need to add a definition for our new method that includes the http verb, method name, description, whether a user must be authenticated with an api token when making the request, and the argument names/types.  Let's say that our endpoint is a GET request with single, string argument called `id` which is required.  Our `Endpoints_ext.json` file will be updated to:
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
With that, we have defined the method including it's arguments.  The system will now recognize GET /newArea/newController/newMethod/1.0.0 as a valid endpoint and will check for the existence of the required argument `id` as well as it's type to make sure it matches the definition.

__NOTE__: The "isUserCreated" flag will be true for all endpoints defined in `Endpoints_ext.json`.

We are now set to define the actual logic of our endpoint.  So back in `/newArea/newController_1_0_0.js` we can add a method.

```
var dataAccess;
var utilities;
var accessControl;
var serviceRegistration;
var settings;
var models;

var Q = require('q');

var Controller = function(da, utils, ac, sr, st, m) {
  dataAccess = da;
  utilities = utils;
  accessControl = ac;
  serviceRegistration = sr;
  settings = st;
  models = m;
};

Controller.prototype.get = {
  newMethod: function(req, callback) {
        var deferred = Q.defer();
    var idArg = req.query.id;

    var successResponse = true;
       var jsonResponseObj = {id: idArg};
    if(successResponse) {
          deferred.resolve(jsonResponseObj);
    }
    else {
      deferred.reject(new ErrorObj(500, 'myErrorCode001', __filename, 'GET newMethod', 'internal error description', 'external error description', {}));
    }

        deferred.promise.nodeify(callback);
        return deferred.promise;
    }
};

Controller.prototype.post = {};

Controller.prototype.put = {};

Controller.prototype.patch = {};

Controller.prototype.delete = {};

exports.newController = Controller;
```

Backstrap will look in the controller under the block defined by http verb.  Since our new method is a GET endpoint, we need to define the method as a kv-pair in that object (as above).  All endpoint controller methods include as input parameters the Express request and a callback (the framework was designed to handle both native callbacks and promises, but over time we have moved towards a promises-only structure).  Name the method the same as the method name from the endpoint url.  Ours is called `newMethod` from /newArea/newController/newMethod/1.0.0.
We create a promise at the beginning, use denodeify with the callback specified on input, and return the promise at the end.  Since `req` is an Express request, you will find the arguments supplied in the request at req.query or req.body depending on the http verb used in the request.  Also, you can be sure of the existence and type-match of the argument `id` as that was checked by the framework before the request arrives at the controller.

__NOTE__: For authenticated requests, Backstrap will append to the req input a parameter named `this_user` which contains the basic account information on the user making the request.


In the method defined above, we are simply responding with the id argument supplied in the request.  But you can also see how we would return an error:

```
deferred.reject(new ErrorObj(500, 'myErrorCode001', __filename, 'GET newMethod', 'internal error description', 'external error description', {}));
```

The ErrorObj includes an http status which the server will return as well as information about where the error originated and any messaging you wish to apply.  The last argument is meant to hold any other payload data you may want in an error response.  You can look through the Controller files in /common/ to get a sense of how to use the onboard error system.

Upon resolve or reject of the promise in the method, Express will fire off the response to the request.


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
### Authenticated Requests
In Settings.json, you will find three fields related to authenticated requests.  They are `token_header`, `timeout_check`, and `timeout`.  By default, their values are:
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

You obtain that token by using the out-of-the-box endpoint /common/accounts/signIn/1.0.0 which if successful returns the token as a parameter of the response.

### Permissions
That explains how to make an authenticated requests, but you may not want all authenticated users to have access to the same endpoints.  For example, you may have an endpoint designed for admins which retrieves information on any user in the system based on name.  You certainly do not want your standard users to have the ability to get private information about each other.  The framework handles this by using endpoint level permissions based on user role.  You can define a new user role (super-user, admin-user, and default-user are set up out-of-the-box), and then assign either whole areas, whole controllers, or specific methods from specific controllers in specific areas as valid endpoints for that role.  This is accomplished in the Security.json file.  Initially, the file looks like this:
```
{
   "roles": [
       {
           "name": "super-user",
           "title": "Super User",
           "created_by": "backstrap",
           "created_date": "8/16/2016",
           "pattern_matches": [
               "Area: common"
           ],
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
           "created_by": "backstrap",
           "created_date": "9/10/2016",
           "pattern_matches": [
               "Area: common | Controller: accounts",
               "Area: common | Controller: analytics",
               "Area: common | Controller: cms"
           ],
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
           "created_by": "backstrap",
           "created_date": "8/14/2016",
           "pattern_matches": [
               "Area: common | Controller: accounts",
               "Area: common | Controller: analytics",
               "Area: common | Controller: cms"
           ],
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
As you can see, there is an object for each user role with a name, title, and description.  You can ignore the pattern_matches field as it is used by the web console to do some fuzzy matching.  The actual specification of permissions takes place in the "areas" array.  Each area to which a user role has some permissions should appear as an object with properties `name` and `permission`.  If you are granting permission to an entire area, you can just fill out the object like this:
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

## Using Extension files
As you saw in the explanation of Controller files, a number of dependencies are injected into controllers.  Probably the two most common of these are dataAccess and utilities.  These two classes contain the framework's functions for reading/writing in the db and those which we have found to be useful in all controllers.  But what if you want to add some functionality to one of these injected files for use in all of your controllers?  For example, if you choose not to use the ORM, you will want to add all of your functions for accessing your database in `dataAccess_ext.js`.  Let's say we have a function which executes some SQL statements on your data and returns the results (we'll call it myCustomSqlMethod()).  When a project is started, `dataAccess_ext.js` will look like this:
```
var Q = require('q');
const { Pool } = require('pg')
var pool;
var dataAccess;
var models;

var DataAccessExtension = function(da, dbConfig, mdls) {  
  models = mdls;
  dataAccess = da;  
}


module.exports = DataAccessExtension;
```

We put our new function in `dataAccess_ext.js` like this:

```
var Q = require('q');
const { Pool } = require('pg')
var pool;
var dataAccess;
var models;

var DataAccessExtension = function(da, dbConfig, mdls) {  
  models = mdls;
  dataAccess = da;  
}

DataAccessExtension.prototype.myCustomSqlMethod = (make, model, color) => {
 var deferred = Q.defer();

 var qry = "INSERT INTO car(make, model, color) VALUES($1, $2, $3)";
 var params = [make, model, color];

 dataAccess.runSql(qry, params)
 .then((res) => {
     deferred.resolve(res);
   })
   .fail((err) => {
     var errorObj = new ErrorObj(500,
                                 'dae0001',
                                 __filename,
                                 'myCustomSqlMethod',
                                 'there was a problem executing this insert',
                                 'There was a problem creating this car object in the database',
                                 err
                               );
     deferred.reject(errorObj);
   });
   return deferred.promise;
}

module.exports = DataAccessExtension;
```

In this way, you will be able to call from any controller `dataAccess.extension.myCustomSqlMethod('mazda', '3', 'black')`.  This is the exact same process for dataAccess_ext.js, accessControl_ext.js, and utilities_ext.js.  The functions you define in them will be available at dataAccess.extension, accessControl.extension, and utilities.extension in all controllers.



Using the ORM:
Backstrap Server comes with an onboard ORM built for maximum flexibility.  You can define model with an arbitrary number of properties using types:
- string — text
- number — numeric
- object — JSON
- array — JSON
- date — ISO formatted string
- file — base64 with no header info
- * — any type / no validation

All models include by default a uuid called `id`, the model name called `object_type`, and a name field.  The framework will also handle adding and managing `created_at` and `updated_at` fields in the database.  We manage schema flexibility by storing ORM data as JSONB in the Postgres tables.  This means we can add and remove properties quickly and without hassle, but you must be mindful of schema changes as that can cause exceptions if you attempt to access a property which has been removed or hasn't yet been added.  If you read through dataAccess.js, you will see that the ORM makes heavy use of  Postgresql's JSONB operators such as containment `@> ` and json property to string `->>`.  You can find more information on Psql's handling of JSONB in the Postgresql docs (__https://www.postgresql.org/docs/9.4/static/functions-json.html__).

A major advantage of using the ORM is that it automatically generates endpoints for each model you define so you that you can GET by any of the model's properties, POST new instances of the  model, PATCH the instances in the db, and DELETE them as well.  For Proof of Concept and smaller projects where data security restrictions can be looser or at the beginning of a project when all models haven't yet been finalized, this is an extremely fast way to get a REST server up and running.  For example, we can make a model called `car` and give it parameters such as color, make, and model.  The framework automatically creates the following endpoints

- GET /common/models/car
- POST /common/models/car
- PATCH /common/models/car
- DELETE /common/models/car

GET includes arguments for each model parameter, so you could use endpoints like `GET /common/models/car?color=blue` to return all blue cars
POST takes one argument for each property of the model and determines whether or not that property is required based on the info in `Models.json`
PATCH takes the id of the object in question and any parameters to be updated or added.  For example, `PATCH /common/models/car` with body: `{make:'mazda', color:'black', model: '3'}`
DELETE takes only the id of the object to be deleted

Relationships can also be created between data models.  The framework will automatically create linking tables in the database to hold the relationship data.  For example, we may want a relationship between our `car` model and an `address` model.  That will cause a new linking table to be created (on restart) that will keep an indexed set of id-pairs linking the model instances.  You create/delete relationships using the dataAccess `addRelationship` and `removeRelationship` functions.  You can then use the dataAccess functions `join`, `joinOne`, `joinWhere`, etc to get the addresses related to a set of or specific car.

Taking it a step further, you may want to name these relationships.  For example, a car may have a home address and a work address associated with it.  We can name our relationships when creating them with dataAccess.addRelationship(CAR_OBJ, ADDRESS_OBJ, 'home') or dataAccess.addRelationship(CAR_OBJ, ADDRESS_OBJ, 'work').  You can then use that relationship name when pulling data with dataAccess.join(CAR_OBJ, 'address', 'home').  That will return the set of address models which are related to CAR_OBJ labeled 'home'.

`Models.json` file format:
```
{
   "models": [
       {
           "obj_type": "car",
           "description": "A car",
           "date_created": "2018-10-15T00:00:00.000Z",
           "date_updated": "2018-11-21T00:00:00.000Z",
           "relationships": [
               {
                   "relates_to": "address",
                   "plural_name": "addresses",
                   "relates_from": "car",
                   "plural_rev": "cars",
                   "linking_table": "car_address",
                   "is_active": true
               }
           ],
           "properties": [
               {
                   "name": "id",
                   "data_type": "string",
                   "required": true,
                   "hint": "This is a system generated field. It is a unique identifier for a record."
               },
               {
                   "name": "name",
                   "data_type": "string",
                   "required": true,
                   "hint": "a name for this car"
               },
               {
                   "name": "make",
                   "required": true,
                   "hint": "",
                   "data_type": "string"
               },
               {
                   "name": "model",
                   "required": true,
                   "hint": "",
                   "data_type": "string"
               },
               {
                   "name": "color",
                   "required": false,
                   "hint": "primary paint color",
                   "data_type": "string"
               }
           ],
           "roles": [
               "super-user"
           ],
           "updated_date": "2018-11-21"
       },
       {
           "obj_type": "address",
           "description": "an address",
           "date_created": "2018-10-15T00:00:00.000Z",
           "date_updated": "2018-11-06T00:00:00.000Z",
           "relationships": [
               {
                   "relates_to": "car",
                   "plural_name": "cars",
                   "relates_from": "address",
                   "plural_rev": "addresses",
                   "linking_table": "car_address",
                   "is_active": true
               }
           ],
           "properties": [
               {
                   "name": "id",
                   "data_type": "string",
                   "required": true,
                   "hint": "This is a system generated field. It is a unique identifier for a record."
               },
               {
                   "name": "name",
                   "data_type": "string",
                   "required": true,
                   "hint": ""
               },
               {
                   "name": "street_address",
                   "required": true,
                   "hint": "",
                   "data_type": "string"
               },
               {
                   "name": "city",
                   "required": true,
                   "hint": "",
                   "data_type": "string"
               },
               {
                   "name": "state",
                   "required": true,
                   "hint": "",
                   "data_type": "string"
               },
               {
                   "name": "county",
                   "required": false,
                   "hint": "",
                   "data_type": "string"
               }
           ],
           "roles": [
               "super-user"
           ],
           "updated_date": "2018-11-06"
       }
   ]
}
```
This describes simple car and address models with a relationship between them.

---

## Additional Features:
Backstrap Server also includes some other features to make development simpler.  For example, you can use the mail settings in Settings.json, the mail methods in utilities.js, and the text and html templates in /templates to generate all sorts of system emails.  These include variable replacement so you can include user-specific information in your system emails.  It relies on the npm package node-mailer and has integrations with a number of popular email services.  It has been tested extensively with SendGrid.

We will be updating this section of the readme with other additional features.  Check back with us to see this new documentation.

---

Send questions to __backstrap@lookfar.com__