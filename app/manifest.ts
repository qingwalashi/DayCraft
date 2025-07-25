import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'DayCraft - 专业工作管理平台',
    short_name: 'DayCraft',
    description: '集项目管理、日报撰写、进度跟踪于一体的现代化工作平台',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#35155D',
    icons: [
      {
        src: '/icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/icon-384x384.png',
        sizes: '384x384',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/maskable-icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      },
      {
        src: '/icons/apple-icon-180x180.png',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any'
      }
    ]
  }
} 