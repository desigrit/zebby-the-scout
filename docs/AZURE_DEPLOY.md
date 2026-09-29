# Azure deployment

The app uses Azure App Service, Azure Database for PostgreSQL Flexible Server, and Azure Blob Storage. The intended public address is `applications424760.raunakoberoi.com`.

## Create the services

1. Create an Azure Database for PostgreSQL Flexible Server in a nearby region. A Burstable tier is sufficient to start for this small personal app. Set backup retention to **35 days**. Create a database named `applications`. Allow the web app to connect to the server. Keep the database credentials in App Service settings, not in GitHub.
2. Create a general-purpose v2 Storage account. Keep anonymous blob access disabled. Under **Data protection**, set blob soft delete to **35 days**. The app creates a private `resumes` container on its first upload.
3. Create a Linux Node.js 22 Azure App Service on a **Basic B1 or higher** plan. A custom domain needs at least Basic. Connect it to this GitHub repository through **Deployment Center**, or use another deployment method that runs `npm ci` and `npm run build`. Set the startup command to `npm run start`.
4. In the App Service environment settings, set `DATABASE_URL` to a PostgreSQL connection URL ending in `?sslmode=require`. Set `AZURE_STORAGE_CONNECTION_STRING` to the Storage account connection string. Set `SCM_DO_BUILD_DURING_DEPLOYMENT=true` if Azure builds the app after deployment. Do not add these values to the repository.
5. Run `npm run db:migrate` once with the production `DATABASE_URL`. Run future migrations after publishing code that changes the schema. The migration script reads the versioned SQL files in `migrations/`.
6. Add `applications424760.raunakoberoi.com` as an App Service custom domain. Set a CNAME for `applications424760` pointing to the app's `*.azurewebsites.net` hostname, plus the domain verification TXT record shown by Azure. Bind a free App Service managed certificate and enable HTTPS-only.
7. Set the App Service health check path to `/api/health`. This route is also available on the Azure default hostname, but application data is only available on the chosen custom domain.

## Verify

Open the custom domain over HTTPS. Add a test application with a small PDF resume, download it, update its status, and remove the test application. Check that the Azure default hostname returns 404 for the dashboard and data routes. Confirm that PostgreSQL backup retention is 35 days and Blob soft delete is enabled for 35 days.

## Recover deleted applications

In the PostgreSQL server's **Backup and restore** page, select a time just before the deletion and restore to a new server. Copy the missing rows from the restored server into the live database, or point the app to the restored server if a full rollback is needed. The resume files remain in Blob Storage when an application is deleted. If a resume file itself is deleted, use Blob soft delete within its retention window.

The site has no account sign-in. Anyone who finds its address can read resumes and change or delete applications. Search engine `noindex` instructions do not restrict access.
