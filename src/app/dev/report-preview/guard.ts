/** The report preview exists for development only: never in a production build or on any Vercel deployment. */
export const previewDisabled = () => process.env.NODE_ENV === "production" || !!process.env.VERCEL_ENV;
