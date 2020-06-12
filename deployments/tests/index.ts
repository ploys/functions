import * as crypto from 'crypto'

import run from '../src'
import push from './fixtures/payloads/push.json'
import tokens from './fixtures/responses/access_tokens.json'
import installation from './fixtures/responses/installation.json'

import { Context, HttpRequest } from '@azure/functions'
import { Harness } from '@ploys/harness'
import { safeDump } from 'js-yaml'

function sign(secret: string, payload: any): string {
  const pld = JSON.stringify(payload).replace(/[^\\]\\u[\da-f]{4}/g, s => {
    return s.substr(0, 3) + s.substr(3).toUpperCase()
  })

  return crypto.createHmac('sha1', secret).update(pld).digest('hex')
}

function context(): Partial<Context> {
  const ctx: any = {}

  ctx.log = jest.fn()
  ctx.log.error = jest.fn()

  return ctx
}

function encode(input: any): string {
  return Buffer.from(safeDump(input)).toString('base64')
}

describe('deployments', () => {
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })

  const harness = new Harness(async () => {
    return {
      webhooks(): any {
        return {
          async receive(data: { id: string; name: string; payload: any }): Promise<void> {
            const ctx = context()
            const sig = sign(process.env.DEPLOYMENTS_WEBHOOK_SECRET!, data.payload)
            const req: HttpRequest = {
              method: 'POST',
              url: '',
              query: {},
              params: {},
              headers: {
                'x-github-delivery': data.id,
                'x-github-event': data.name,
                'x-hub-signature': `sha1=${sig}`,
              },
              body: data.payload,
            }

            await run(ctx as any, req)
          },
        }
      },
    }
  })

  beforeEach(harness.setup)
  afterEach(harness.teardown)

  test('responds to webhook', async () => {
    await harness.run(async cx => {
      process.env.DEPLOYMENTS_APP_ID = '1'
      process.env.DEPLOYMENTS_PRIVATE_KEY = privateKey
      process.env.DEPLOYMENTS_WEBHOOK_SECRET = 'secret'

      cx.expect()
        .intercept()
        .persist()
        .get('/repos/ploys/tests/installation')
        .reply(200, installation)

      cx.expect()
        .intercept()
        .persist()
        .post('/app/installations/1/access_tokens')
        .reply(200, tokens)

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/contents/.github%2Fworkflows')
        .query({ ref: 'da4b9237bacccdf19c0760cab7aec4a8359010b0' })
        .reply(200, [
          {
            type: 'file',
            name: 'deploy.yml',
            path: '.github/workflows/deploy.yml',
          },
        ])

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/contents/.github%2Fworkflows%2Fdeploy.yml')
        .query({ ref: 'da4b9237bacccdf19c0760cab7aec4a8359010b0' })
        .reply(200, {
          type: 'file',
          name: 'deploy.yml',
          path: '.github/workflows/deploy.yml',
          encoding: 'base64',
          content: encode({
            on: 'deployment',
          }),
        })

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/contents/.github%2Fdeployments')
        .query({ ref: 'da4b9237bacccdf19c0760cab7aec4a8359010b0' })
        .reply(200, [
          {
            type: 'file',
            name: 'valid.yml',
            path: '.github/deployments/valid.yml',
          },
        ])

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/contents/.github%2Fdeployments%2Fvalid.yml')
        .query({ ref: 'da4b9237bacccdf19c0760cab7aec4a8359010b0' })
        .reply(200, {
          type: 'file',
          name: 'valid.yml',
          path: '.github/deployments/valid.yml',
          encoding: 'base64',
          content: encode({
            id: 'valid',
            name: 'valid',
            description: 'The valid deployment configuration',
            on: 'push',
          }),
        })

      cx.expect()
        .intercept()
        .get('/repos/ploys/tests/commits/da4b9237bacccdf19c0760cab7aec4a8359010b0/check-suites')
        .query({ app_id: 1 })
        .reply(200, { total_count: 0, check_suites: [] })

      cx.expect().intercept().post('/repos/ploys/tests/check-suites').reply(200)

      cx.expect()
        .intercept()
        .post('/repos/ploys/tests/check-runs', body => {
          expect(body).toMatchObject({
            name: 'valid',
            external_id: 'valid',
            status: 'queued',
          })
          return true
        })
        .reply(201, {
          id: 1,
        })

      cx.expect()
        .intercept()
        .post('/repos/ploys/tests/git/refs', body => {
          expect(body).toMatchObject({
            sha: 'da4b9237bacccdf19c0760cab7aec4a8359010b0',
            ref: 'refs/heads/deployments/valid',
          })
          return true
        })
        .reply(201)

      cx.expect()
        .intercept()
        .post('/repos/ploys/tests/deployments', body => {
          expect(body).toMatchObject({
            environment: 'valid',
            ref: 'deployments/valid',
            payload: {
              check_run_id: 1,
              stages: ['deploy'],
              completed_stages: [],
              artifacts: {},
            },
          })
          return true
        })
        .reply(201, {
          id: 1,
        })

      cx.expect()
        .intercept()
        .post('/repos/ploys/tests/deployments/1/statuses', body => {
          expect(body).toMatchObject({
            state: 'queued',
          })
          return true
        })
        .reply(201)

      cx.expect()
        .intercept()
        .patch('/repos/ploys/tests/check-runs/1', body => {
          expect(body).toMatchObject({
            status: 'queued',
          })
          return true
        })
        .reply(200)

      await cx.receive('push', push)
    })
  })
})
