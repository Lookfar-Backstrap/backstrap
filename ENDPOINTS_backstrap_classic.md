# Endpoint List

---
- [Accounts](#accounts)
  - [`profile`](#profile)
  - [`profileImage`](#profile-image)
  - [`user`](#user)
  - [`userExists`](#user-exists)
  - [`defaultUserCheck`](#default-user-check)
  - [`oauth_signIn`](#sign-in)
  - [`twitter_oauth_token`](#twitter-oauth)
  - [`signIn`](#sign-in)
  - [`signUp`](#sign-up)
  - [`signOut`](#sign-out)
  - [`startAnonymousSession`](#start-anonymous-session)
  - [`forgotPassword`](#forgot-password)
  - [`resetPassword`](#reset-password)
  - [`account`](#account)
  - [`password`](#password)
- [Internal System](#internal-system)
  - [`version`](#version)
  - [`headerTokenKey`](#header-token-key)
  - [`endpoint`](#endpoint)
  - [`health`](#health)
  - [`reload`](#reload)
- [CMS](#cms)
  - [`file`](#file)
- [Admin](#admin)
  - [`user`](#user-admin)
  - [`userRole`](#user-role)
- [Data](#data)
  - [`query`](#query)
  - [`updateAll`](#update-all)
  - [`create`](#create)
  - [`update`](#update)
  - [`upload`](#upload)
- [Analytics](#analytics)
  - [`event`](#event)

---

## <span id="accounts">Accounts</span>

---

### <span id="profile">`profile`</span>
 __GET__ `/common/accounts/profile/1.0.0`

The profile endpoints allow you to view and update additional information you want to keep on your user objects. Certain properties of a user object cannot be modified directly (`id`, `object_type`, `is_active`, `username`, `password`, `salt`, `created_at`, `modified_at`, and `roles`), but aside from those, you are free to modify or create new properties to let your user model store whatever information you see fit. It should also be noted that additional profile properties are added automatically when a user signs up using `oauth`.

__Headers:__

`Content-Type: application/json`

`bs_api_token: [AUTH TOKEN]`

__Returns:__

`profile` object of user associated with this auth token.

![__GET__ profile](src/GET-profile.png)

---

### <span id="profile-image">`profileImage`</span>
Currently the `profileImage` endpoints are disabled. They only return an empty object.

---

### <span id="user">`user`</span>
__GET__ `/common/accounts/user/1.0.0`

This endpoint takes a `username` and returns the `user` object (minus the `password`, `salt`, `forgot_password_tokens` and other sensitive info).

__Headers:__

`Content-Type: application/json`

`bs_api_token: [AUTH TOKEN]`

__Arguments:__

`username: string` (required)

__Returns:__

`user` object minus sensitive information.


![__GET__ profile](src/GET-user.png)

---

### <span id="user-exists">`userExists`</span>
__GET__ `/common/accounts/userExists/1.0.0`

Given a username, this endpoint either returns a success notification `{ 'user_exists': true }` or it fails with http_status 400.

__Headers:__

`Content-Type: application/json`

`bs_api_token: [AUTH TOKEN]`

__Arguments:__

`username: string`

__Returns:__

`{ user_exists: [BOOLEANS] }`

![__GET__ userExists](src/GET-userExists.png)

---

### <span id="default-user-check">`defaultUserCheck`</span>
__GET__ `/common/accounts/defaultUserCheck/1.0.0`

This endpoint checks to see if the default super-user (bsuser) exists. The web console uses this endpoint and on initial startup prompts the user to setup a password for that user. Using bsuser and the password entered during setup, the user can then add other users.

__Headers:__

`Content-Type: application/json`

`bs_api_token: [AUTH TOKEN]`

__Returns:__

`{ setup_pending: [BOOLEAN], token: [FORGOT PASSWORD TOKEN] }`

![__GET__ profile](src/GET-defaultUserCheck.png)

---

### <span id="sign-in">`oauth_signIn`</span>
__POST__ `/common/accounts/oauth_signIn/1.0.0`

This endpoint allows users to sign in using external credentials from Google, Facebook, and Twitter.

 __Headers:__

`Content-Type: application/json`

`bs_api_token: [AUTH TOKEN]`

 __Arguments:__

`auth: object` (required) - An object containing response tokens from `oauth` provider

`service: string` (required) - Name of the `oauth` provider

`clientInfo: string` - ANy additional info about this log in (from browser, from app, etc)

---

### <span id="twitter-oauth">`twitter_oauth_token`</span>
__POST__ `/common/accounts/twitter_oauth_token/1.0.0`

This endpoint retruns the initial `oauth` token from twitter.

---

### <span id="sign-in">`signIn`</span>
__POST__ `/common/acccounts/signIn/1.0.0`

This Endpoint signs the user in using system credentials.

__Headers:__

`Content-Type: application/json`

__Arguments:__

`username: string` (required)

`password: string` (required)

`clientInfo: string`

![__POST__ signIn](src/POST-signIn.png)

---

### <span id="sign-up">`signUp`</span>
__POST__ `/common/accounts/signUp/1.0.0`

This endpoint is used to sign up for new system credentials.

__Headers:__

`Content-Type: application/json`

__Arguments:__

`username: string` (required)

`password: string` (required)

`email: string` (required) - used for Forgot Password and Welcome Email

`first: string` - user's first name

`last: string` - user's last name

__Returns:__

Returns a new `account` object for the system



![__POST__ signUp](src/POST-signUp.png)

---

### <span id="sign-out">`signOut`</span>
__POST__ `/common/accounts/signOut/1.0.0`

This endpoint is used to sign out of the system.

__Headers:__

`Content-Type: application/json`

`bs_api_token: [AUTH TOKEN]`

__Returns:__

`{ sign_out: true }`



![__POST__ signOut](src/POST-signOut.png)

---

### <span id="start-anonymous-session">`startAnonymousSession`</span>
__POST__ `/common/accounts/startAnonymousSession/1.0.0`</span>

This endpoint starts an anonymous session on the system.

__Headers:__

`Content-Type: application/json`

__Arguments:__

`clientInfo: string` - any additional info about this log in (from browser, from app, etc.)

__Returns:__

Returns a `session` `object_type`, detailing an anonymous `username`, and it generates a new anonymous token.



![__POST__ startAnonymousSession](src/POST-startAnonymousSession.png)

---

### <span id="forgot-password">`forgotPassword`</span>
__POST__ `/common/accounts/forgotPassword/1.0.0`

This endpoint emails a token to reset the user's `password`.

__Headers:__

`Content-Type: application/json`

__Arguments:__

`username: string`

`email: string`

__Returns:__

`{ "success": [BOOLEAN] }`



![__POST__ forgotPassword](src/POST-forgotPassword.png)

---

### <span id="reset-password">`resetPassword`</span>
__POST__ `/common/accounts/resetPassword/1.0.0`

This endpoint resets the `password` using a token.

__Headers:__

__Arguments:__

`token: string` (required)

`password: string` (required)

---

### <span id="account">`account`</span>
__PUT__ `/common/accounts/account/1.0.0`

This endpoint updates the system's `account` model.

__Headers:__

`Content-Type: application/json`

`bs_api_token: [AUTH TOKEN]`

__Arguments:__

`username: string` (required)

`email: string` (required)

`first: string` (required)

`last: string` (required)

![__PUT__ account](src/PUT-account.png)

---

__DELETE__ `/common/accounts/account/1.0.0`

This endpoint updates the system's `account` model to be deactivated.

__Headers:__

`Content-Type: application/json`

__Returns:__

This endpoint has no return, only deactivates associated account.

---

### <span id="password">`password`</span>
Currently the `password` endpoints are disabled. They only return an empty object.

---

## <span id="internal-system">Internal System</span>

---

### <span id="version">`version`</span>
__GET__ `/common/internalSystem/version/1.0.0`

__Headers:__

`Content-Type: application/json`

__Returns:__

`{ "version": [VERSION] }`

![__GET__ version](src/GET-version.png)

---

### <span id="header-token-key">`headerTokenKey`</span>
__GET__ `/common/internalSystem/headerTokenKey/1.0.0`

__Headers:__

`Content-Type: application/json`

__Returns:__

`{ "header_token_key": "bs_api_token" }`

![__GET__ headerTokenKey](src/GET-headerTokenKey.png)

---

### <span id="endpoint">`endpoint`</span>
__GET__ `/common/internalSystem/endpoint/1.0.0`

This endpoint retrieves a model of registered service calls from the system.

__Headers:__

`Content-Type: application/json`

![__GET__ endpoint](src/GET-endpoint.png)

---

__POST__ `/common/internalSystem/endpoint/1.0.0`

This endpoint registers a service call with the system.

__Headers:__

`Content-Type: application/json`

`bs_api_token: [AUTH TOKEN]`

__Arguments:__

`call: string` (required)

`area: string` (required)

`controller: string` (required)

`verb: string` (required)

`version: string` (required)

`args: array` (required)

`authRequired: boolean` (required)

`description: string` (required)

![__POST__ endpoint](src/POST-endpoint.png)

---

__PATCH__ `/common/internalSystem/endpoint/1.0.0`

This endpoint updates a registered service call that's already in the system.

__Headers:__

`Content-Type: application/json`

`bs_api_token: [AUTH TOKEN]`

__Arguments:__

`call: string` (required)

`area: string` (required)

`controller: string` (required)

`verb: string` (required)

`version: string` (required)

`args: array`

`authRequired: boolean`

`description: string`

---

__DELETE__ `/common/internalSystem/endpoint/1.0.0`

This endpoint deletes a registered service call from the system.

__Headers:__

`Content-Type: application/json`

`bs_api_token: [AUTH TOKEN]`

__Arguments:__

`call: string` (required)

`area: string` (required)

`controller: string` (required)

`verb: string` (required)

`version: string` (required)

---

### <span id="health">`health`</span>

__GET__ `/common/internalSystem/health/1.0.0`

This endpoint checks the server health of the system.

 __Headers:__

`Content-Type: application/json`

 __Returns:__

`{ "status": [STATUS], "ip": [IP], "datetime": [DATETIME] }`

![__GET__ health](src/GET-health.png)

---

### <span id="reload">`reload`</span>
__POST__ `/common/internalSystem/reload/1.0.0`

This endpoint reloads the server config of the system.

__Headers:__

`Content-Type: application/json`

`bs_api_token: [AUTH TOKEN]`

__Returns:__

`{ "success": [BOOLEAN] }`

![__POST__ reload](src/POST-reload.png)

---

## <span id="cms">CMS</span>

---

### <span id="file">`file`</span>
__GET__ `/common/cms/file/1.0.0`

This endpoint retrieves a file from the system.
__Headers:__

`Content-Type: application/json`

`bs_api_token: [AUTH TOKEN]`

__Arguments:__

`file_name: string` (required) - no extension needed

__Returns:__

`{ "file_name": [ARRAY] }`

![__GET__ file](src/GET-file.png)

---

__POST__ `/common/cms/file/1.0.0`

This endpoint posts a new file to the system.

__Headers:__

`Content-Type: application/json`

`bs_api_token: [AUTH TOKEN]`

__Arguments:__

`file_name: string` (required) - no extension needed

---

## <span id="admin">Admin</span>

---

### <span id="user-admin">`user`</span>
__GET__ `/common/admin/user/1.0.0`

This endpoint retrieves a list of users from the system.

__Headers:__

`Content-Type: application/json`

`bs_api_token: [AUTH TOKEN]`

__Arguments:__

`username: string`

`id: string`

`email: string`

![__GET__ user](src/GET-user-admin.png)

---

__POST__ `/common/admin/user/1.0.0`

This endpoint adds a new user to the system.

__Headers:__

`Content-Type: application/json`

`bs_api_token: [AUTH TOKEN]`

__Arguments:__

`username: string` (required)

`id: string` (required)

`email: string` (required)

`first: string`

`last: string`

`roles: array`

`userprofile: object`

---

__PATCH__ `/common/admin/user/1.0.0`

This endpoint updates a user model in the system.

__Headers:__

`Content-Type: application/json`

`bs_api_token: [AUTH TOKEN]`

__Arguments:__

`username: string`

`id: string` (required)

`email: string`

`first: string`

`last: string`

`roles: array`

`userprofile: object`

---

__DELETE__ `/common/admin/user/1.0.0`

This endpoint deletes a user from the system.

__Headers:__

`Content-Type: application/json`

`bs_api_token: [AUTH TOKEN]`

__Arguments:__

`id: string` (required)


---

### <span id="user-role">`userRole`</span>
__GET__ `/common/admin/userRole/1.0.0`

This endpoint retrieves a user's role from the system.

__Headers:__

`Content-Type: application/json`

`bs_api_token: [AUTH TOKEN]`

__Arugments:__

`username: string` (required)

![__GET__ userRole](src/GET-userRole.png)

---

__POST__ `/common/admin/userRole/1.0.0`

This endpoint adds a new `userRole` to a user's model in the system.

__Headers:__

`Content-Type: application/json`

`bs_api_token: [AUTH TOKEN]`

__Arguments:__

`username: string` (required)

`role: string` (required) - super-user, default-user, admin-user

__Returns:__

`{ "success": [BOOLEAN] }`

![__POST__ userRole](src/POST-userRole.png)

---

__DELETE__ `/common/admin/userRole/1.0.0`

This endpoint deactivates a user's `userRole`.

__Headers:__

`Content-Type: application/json`

`bs_api_token: [AUTH TOKEN]`

__Arguments:__

`username: string` (required)

`role: string` (required)

__Returns:__

`{ "success": [BOOLEAN] }`

![__DELETE__ userRole](src/DELETE-userRole.png)

---

## <span id="data">Data</span>

---

### <span id="query">`query`</span>
__GET__ `/common/data/query/1.0.0`

__Headers:__

`Content-Type: application/json`

`bs_api_token: [AUTH TOKEN]`

---

__POST__ `/common/data/query/1.0.0`

__Headers:__

`Content-Type: application/json`

`bs_api_token: [AUTH TOKEN]`

__Arguments:__

`query_object: object`

---

### <span id="update-all">`updateAll`</span>
__POST__ `/common/data/updateAll/1.0.0`

This endpoint updates all the entities within the system.

__Headers:__

`Content-Type: application/json`

`bs_api_token: [AUTH TOKEN]`

__Arguments:__

`update_all_object: object` (required)

---

### <span id="create">`create`</span>
__POST__ `/common/data/create/1.0.0`

This endpoint creates a new entity within the system.

__Headers:__

`Content-Type: application/json`

`bs_api_token: [AUTH TOKEN]`

__Arguments:__

`create_object: object`

---

### <span id="update">`update`</span>
__POST__ `/common/data/update/1.0.0`

This endpoint updates an entity within the system.

__Headers:__

`Content-Type: application/json`

`bs_api_token: [AUTH TOKEN]`

__Arguments:__

`update_object: object`

---

### <span id="upload">`upload`</span>
__POST__ `/common/data/upload/1.0.0`

This endpoint uploads a file to the system.

__Headers:__

`Content-Type: application/json`

`bs_api_token: [AUTH TOKEN]`

__Arguments:__

`file_data: file` (required)

`file_name: string` (required)

`file_destination: string`

`remote_save: [BOOLEAN]`

---

## <span id="analytics">Analytics</span>

---

### <span id="event">`event`</span>
__POST__ `/common/data/event/1.0.0`

This endpoint logs an analytics event.

__Headers:__

`Content-Type: application/json`

`bs_api_token: [AUTH TOKEN]`

__Arguments:__

`event_descriptor: object` (required) - an object describing the event to be logged (including timestamp)

---
