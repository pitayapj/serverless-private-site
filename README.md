# CDK Template

Private Site with serverless services

## Tables of contents

- [Background](#background)
- [Requirements](#requirements)
- [Application Register](#saml-application-register)
- [CDK Constants/Env Prepare](#cdk-constantsenvironment-prepare)
- [Deploy CDK](#deploy-cdk-app)
- [Finish Application Register](#finish-application-register)

## Background

Extend from CDK template, this is an another template for private site with serverless services with authentication support for Google and AWS Identity Center (from now on will be refference as IAM-IC)

## Requirements

Set up necessary packages

1. AWS CLI

   https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html

2. npm
3. CDK Typescript
   ```sh
   npm install
   npm -g install typescript
   ```
4. AWS Credential (I will use AWS SSO Account with --profile flag)

## SAML Application Register
Cognito support both SAML Metadata URL and Metadata file upload.

Representing them is Google(metadata file) and IAM-IC(url).

You need to decide which authentication method to choose from and prepare each accordingly.

You need to register application in either Google or IAM-IC

Since this cdk application support multiple environments deployment.

You might need to repeat this step for each environment.

### Google
- Following this guide from Google https://support.google.com/a/answer/6087519?hl=en#zippy=

- When reach **Google Identity Provider details**

- Download the Metadata File and process to next step, Environment Prepare

### IAM-IC
- Login to AWS Console

- Go to IAM Identity Center Service

- Go to Application option from the left side panel

- Choose Add application -> I have an application I want to set up -> Click Next

- An information screen apprear. Locate **IAM Identity Center SAML metadata file** and copy the URL

- Process to next step

## CDK Constants/Environment prepare

### Google
For Metadata file, add them to the root directory of this cdk project under format 

GoogleIDPMetadata-{environment}.xml

Environment string supports: **dev**, **stg** and **prod**

### IAM-IC
For URL, paste them directly into iamIcMetadataUrl property for each environemnt in `lib/parameters/constants.ts`

You can use the example URL for the environment you haven't ready to deploy yet


# Deploy CDK App
Prepare other necessary parameter to deploy CDK app (reference　.env.example)

- You need a repository in github for cdk app and established Github and Codestar connection
- Along with choosing region and AWS account to deploy, edit said repo name and connection arn in .env file
- Choose which environment to deploy or not deploy by commenting `lib/stacks/cdk-pipeline.ts` line 106-115
- Deploy CDK app

Deploy CDK app with 
```sh
cdk deploy CDKPipelineStack --profile pitaya
# you will ne to wait for cdk pipeline to deploy your components
```

## Finish application register
You need to wait for CDK pipeline to deploy our application.

After it finished, go to Cognito service, choose our newly created user pool and get 2 of follow information:

- User Pool ID, access **Overview** page from left side panel

Format: region_abcdEFGH

Ex: ap-northeast-1_lJBoDhD1D

- Cognito DomainUrl, access **Domain** page from left side panel

Format: https://&lt;customize-sub-domain&gt;.auth.region.amazoncognito.com

### Compose ACS URL and Entity ID

From User pool ID and Cognito DomainUrl we will need to create ACS URL and Entity ID

- ACS URL
append `/saml2/idpresponse` to last part of Cognito DomainUrl so we will have something like this 
```
https://&lt;customize-sub-domain&gt;.auth.region.amazoncognito.com/saml2/idpresponse
```

- Entity ID
Append `urn:amazon:cognito:sp:` before User pool ID so we have something like this 
```
urn:amazon:cognito:sp:ap-northeast-1_lJBoDhD1D
```

### Google
Go back to our creating app screen.

Continue setting it up:

- Application Name: on your discretion
- ACS URL(previously composed):  https://&lt;customize-sub-domain&gt;.auth.region.amazoncognito.com/saml2/idpresponse
- Entity ID(previously composed): urn:amazon:cognito:sp:ap-northeast-1_lJBoDhD1D
- Start URL: 
go to Cognito, go to **App client** page from left side panel and copy the client id

set the identity_provider to google-{enviroment} (this could be unify. Only 1 file if your apps use the same Google workspace)

redirect_uri will be your app URL with the path /parseauth

so it will be something like below
```
identity_provider=google-dev&client_id=6a06mi95j8e3dkjrcu9cd0e5od&scope=openid+phone+profile+email+aws.cognito.signin.user.admin&response_type=code&redirect_uri=https://example.com/parseauth
```
- Mapping attribute: primary email -> email

Also enable it for email group that you want to grant access to (or enable it for all users)
### IAM-IC
Easier than Google

- ACS URL(previously composed):  https://&lt;customize-sub-domain&gt;.auth.region.amazoncognito.com/saml2/idpresponse
- Entity ID(previously composed): urn:amazon:cognito:sp:ap-northeast-1_lJBoDhD1D

Create then edit mapping: ${user:email} -> primaryEmail