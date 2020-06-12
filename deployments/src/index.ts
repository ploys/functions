import { Context, HttpRequest } from '@azure/functions'
import { Application } from '@ploys/deployments-core'

export default async function run(ctx: Context, req: HttpRequest): Promise<void> {
  try {
    if (!process.env.DEPLOYMENTS_APP_ID) {
      throw new Error("Expected environment variable 'DEPLOYMENTS_APP_ID'")
    }

    if (!process.env.DEPLOYMENTS_PRIVATE_KEY) {
      throw new Error("Expected environment variable 'DEPLOYMENTS_PRIVATE_KEY'")
    }

    if (!process.env.DEPLOYMENTS_WEBHOOK_SECRET) {
      throw new Error("Expected environment variable 'DEPLOYMENTS_WEBHOOK_SECRET'")
    }

    const id = Number.parseInt(process.env.DEPLOYMENTS_APP_ID!)
    const secret = process.env.DEPLOYMENTS_WEBHOOK_SECRET!
    const privateKey = process.env.DEPLOYMENTS_PRIVATE_KEY!

    const app = new Application({ id, secret, privateKey })
    app.initialize()

    const uuid = req.headers['x-github-delivery']
    const name = req.headers['x-github-event']
    const signature = req.headers['x-hub-signature']
    const webhooks = app.webhooks()
    await webhooks.verifyAndReceive({ id: uuid, name, signature, payload: req.body })

    ctx.log(`Processed request ${name} for ${uuid}`)

    ctx.res = {
      status: 200,
      body: JSON.stringify({ message: 'Executed' }),
    }
  } catch (err) {
    ctx.log.error(err)

    ctx.res = {
      status: 500,
      body: JSON.stringify({ message: err.message }),
    }
  }
}
