import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // NOTE: 监听 0.0.0.0 让局域网内的其他设备也可通过 IP 访问
    host: '0.0.0.0',
    // NOTE: 允许特定域名和所有主机访问（解决拾光穿透屏蔽问题）
    allowedHosts: ['yytianjin.yyboxdns.com', 'all'],
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
