import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { RequestContext } from '../../src/core/http.js'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Duplex } from 'node:stream'
import { HttpException } from '../../src/core/HttpException.js'

// Mock IncomingMessage and ServerResponse for unit testing
class MockIncomingMessage extends Duplex {
    headers: Record<string, string> = {}
    method: string = 'POST'
    url: string = '/'
    _read() {}
    _write(chunk: any, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
        callback()
    }
}

class MockServerResponse extends Duplex {
    statusCode: number = 200
    _headers: Record<string, string> = {}
    _ended: boolean = false

    setHeader(name: string, value: string): void {
        this._headers[name.toLowerCase()] = value
    }
    hasHeader(name: string): boolean {
        return !!this._headers[name.toLowerCase()]
    }
    end(): this {
        this._ended = true
        return this
    }
    _read() {}
    _write(chunk: any, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
        callback()
    }
}

describe('RequestContext.bodyRaw/bodyJson', () => {
    let mockReq: MockIncomingMessage
    let mockRes: MockServerResponse
    let ctx: RequestContext

    beforeEach(() => {
        mockReq = new MockIncomingMessage()
        mockRes = new MockServerResponse()
        ctx = new RequestContext(mockReq as any, mockRes as any)
    })

    // Given a request with a body exceeding the limit
    // When bodyRaw is called
    // Then it should throw HttpException 413 and not double-settle
    it('should throw 413 for body exceeding limit and not double-settle', async () => {
        const limit = 10
        const largeBody = Buffer.from('a'.repeat(limit + 1))

        const promise = ctx.bodyRaw(limit)

        mockReq.emit('data', largeBody.subarray(0, limit))
        mockReq.emit('data', largeBody.subarray(limit)) // Exceeds limit here

        await expect(promise).rejects.toThrow(new HttpException(413, 'Content Too Large', true))
        expect(mockReq.destroyed).toBe(true) // Request should be destroyed
        // Ensure no double-settle by trying to resolve again
        mockReq.emit('end')
        mockReq.emit('error', new Error('Should not be called'))
    })

    // Given an aborted request
    // When bodyRaw is called
    // Then it should throw HttpException 499
    it('should throw 499 when request is aborted', async () => {
        const promise = ctx.bodyRaw()
        mockReq.emit('aborted')
        await expect(promise).rejects.toThrow(new HttpException(499, 'Client Closed Request', true))
        expect(mockReq.destroyed).toBe(true)
    })

    // Given a request with invalid JSON body
    // When bodyJson is called
    // Then it should throw HttpException 400
    it('should throw 400 for invalid JSON body', async () => {
        const invalidJson = Buffer.from('{ "key": "value" ') // Incomplete JSON
        const promise = ctx.bodyJson()

        mockReq.emit('data', invalidJson)
        mockReq.emit('end')

        await expect(promise).rejects.toThrow(new HttpException(400, 'Invalid JSON', true))
    })

    // Given a request with valid JSON body
    // When bodyJson is called
    // Then it should parse the JSON correctly
    it('should parse valid JSON body', async () => {
        const validJson = Buffer.from(JSON.stringify({ test: 'data' }))
        const promise = ctx.bodyJson()

        mockReq.emit('data', validJson)
        mockReq.emit('end')

        await expect(promise).resolves.toEqual({ test: 'data' })
    })

    // Given a request with a body within the limit
    // When bodyRaw is called
    // Then it should resolve with the raw buffer
    it('should resolve with raw buffer for body within limit', async () => {
        const body = Buffer.from('hello world')
        const promise = ctx.bodyRaw()

        mockReq.emit('data', body)
        mockReq.emit('end')

        await expect(promise).resolves.toEqual(body)
    })

    // Given a request with no body
    // When bodyRaw is called
    // Then it should resolve with an empty buffer
    it('should resolve with empty buffer for no body', async () => {
        const promise = ctx.bodyRaw()
        mockReq.emit('end')
        await expect(promise).resolves.toEqual(Buffer.from(''))
    })
})
