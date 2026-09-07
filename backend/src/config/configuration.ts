export default () => ({
  port: Number(process.env.PORT || 3000),
  storageRoot: process.env.STORAGE_ROOT || './storage',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 25),

  jwt: {
    // Refuse to start on the default in production rather than ship a known secret.
    secret: process.env.JWT_SECRET || 'dev-only-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '12h',
  },

  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@smart-life.sa',
    password: process.env.ADMIN_PASSWORD || 'ChangeMe123!',
    name: process.env.ADMIN_NAME || 'Administrator',
  },

  defaults: {
    contractorName: process.env.DEFAULT_CONTRACTOR_NAME || 'SMART LIFE',
    projectName: process.env.DEFAULT_PROJECT_NAME || 'SMART TOWER',
    currency: process.env.DEFAULT_CURRENCY || 'SAR',
  },

  externalProjects: {
    // The Tawal-side tracker that supplies the project list for GCL.
    url:
      process.env.EXTERNAL_PROJECTS_URL ||
      'http://147.79.114.76:5003/api/projects/public/projects',
    SITE_TAGS_URL:
      process.env.SITE_TAGS_URL ??
      'https://tawal-site.smart-life.sa/api/sites/tags',
  },

  puppeteerExecutablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  sofficePath: process.env.SOFFICE_PATH || 'soffice',
});
