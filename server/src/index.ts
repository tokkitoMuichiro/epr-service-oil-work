import cors from 'cors'
import express from 'express'

const app = express()
const port = Number(process.env.PORT) || 4568

app.use(cors())
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'erp-ammir-api',
    time: new Date().toISOString(),
  })
})

app.get('/api', (_req, res) => {
  res.json({
    name: 'ERP АММИР API',
    version: '0.1.0',
    endpoints: ['/health'],
  })
})

app.listen(port, '0.0.0.0', () => {
  console.log(`API listening on http://0.0.0.0:${port}`)
})
