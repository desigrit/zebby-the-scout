# Azure deployment

The app uses Azure App Service, Azure Database for PostgreSQL Flexible Server, and Azure Blob Storage. Use the HTTPS default domain shown on the App Service Overview page. New Azure apps normally receive a hostname with a generated suffix and region, so copy the exact address shown by Azure.

## Create the services

1. Create a Linux Node.js 24 Azure App Service on a **Basic B1 or higher** plan. Under **Deployment**, leave continuous deployment off until the app settings are ready. Copy the default domain and all **Outbound IP addresses** from the app's Overview and Networking pages. Set the startup command to `npm run start`.
2. Create an Azure Database for PostgreSQL Flexible Server in the same region. A Burstable tier is sufficient to start for this small personal app. Set backup retention to **35 days**. The default `postgres` database is sufficient. Choose public access with firewall rules. Add each App Service outbound IP address under the PostgreSQL server's **Networking** settings, using the same IP as both the start and end of each rule. Leave the option that allows access from all Azure services off. Keep the database credentials in App Service settings, not in GitHub.
3. Create a general-purpose v2 Storage account in the same region. Keep anonymous blob access disabled and storage account key access enabled. Under **Data protection**, set blob and container soft delete to **35 days**. The app creates a private `resumes` container on its first upload.
4. In the App Service environment settings, set `PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE=postgres`, and `AZURE_STORAGE_CONNECTION_STRING`. Set `SCM_DO_BUILD_DURING_DEPLOYMENT=true` if Azure builds the app after deployment. Do not add these values to the repository.
5. Set the startup command to `npm run start`. It applies the versioned SQL migrations before starting the web server.
6. Open the App Service's **Deployment Center**, choose GitHub, account `desigrit`, repository `applications`, branch `main`, and GitHub Actions. Use a user-assigned identity for deployment if prompted. Wait for the generated GitHub Actions run to succeed.
7. Turn on **HTTPS Only** and set the App Service health check path to `/api/health`. Azure supplies the allowed production hostname through `WEBSITE_DEFAULT_HOSTNAME`. No DNS records or custom domain are needed.

## Verify

Open the App Service default domain over HTTPS. Add a test application with a small PDF resume, download it, update its status, and remove the test application. Confirm that `/api/health` reports a healthy database, PostgreSQL backup retention is 35 days, and Blob soft delete is enabled for 35 days.

## Recover deleted applications

In the PostgreSQL server's **Backup and restore** page, select a time just before the deletion and restore to a new server. Copy the missing rows from the restored server into the live database, or point the app to the restored server if a full rollback is needed. The resume files remain in Blob Storage when an application is deleted. If a resume file itself is deleted, use Blob soft delete within its retention window.

The site has no account sign-in. Anyone who finds its address can read resumes and change or delete applications. Search engine `noindex` instructions do not restrict access.
