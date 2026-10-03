import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.APP_URL ?? 'http://localhost:3000';
  return [
    { url: `${base}/`, lastModified: new Date() },
    { url: `${base}/case-study`, lastModified: new Date() },
  ];
}
