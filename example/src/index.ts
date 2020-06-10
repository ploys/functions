import { Context, HttpRequest } from '@azure/functions'

export default async function run(ctx: Context, req: HttpRequest): Promise<void> {
  ctx.log('HTTP trigger function processed a request.')

  const name = req.query.name || (req.body && req.body.name)

  if (name) {
    ctx.res = {
      body: `Hello ${name}`,
    }
  } else {
    ctx.res = {
      status: 400,
      body: 'Please pass a name on the query string or in the request body',
    }
  }
}
