export default () => ({
  port: Number(process.env.PORT || 3000),
  storageRoot: process.env.STORAGE_ROOT || './storage',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 25),
  defaults: {
    contractorName: process.env.DEFAULT_CONTRACTOR_NAME || 'SMART LIFE',
    projectName: process.env.DEFAULT_PROJECT_NAME || 'SMART TOWER',
    currency: process.env.DEFAULT_CURRENCY || 'SAR',
  },
  puppeteerExecutablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
});
