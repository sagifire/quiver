import { describe, it, expect, vi } from 'vitest';
import { compose } from '../../src/core/compose'; // Оновлений шлях до compose

describe('compose() для pipes', () => {
  it('повинен виконувати pipes послідовно, а потім handler', async () => {
    const calls: string[] = [];
    const pipe1 = async (ctx: any) => {
      calls.push('pipe1');
    };
    const pipe2 = async (ctx: any) => {
      calls.push('pipe2');
    };
    const handler = async (ctx: any) => {
      calls.push('handler');
    };

    const composedHandler = compose([pipe1, pipe2], handler);
    await composedHandler({});

    expect(calls).toEqual(['pipe1', 'pipe2', 'handler']);
  });

  it('повинен зупиняти виконання, якщо pipe кидає виняток', async () => {
    const calls: string[] = [];
    const pipe1 = async (ctx: any) => {
      calls.push('pipe1');
      throw new Error('Pipe error');
    };
    const pipe2 = async (ctx: any) => {
      calls.push('pipe2');
    };
    const handler = async (ctx: any) => {
      calls.push('handler');
    };

    const composedHandler = compose([pipe1, pipe2], handler);

    await expect(composedHandler({})).rejects.toThrow('Pipe error');
    expect(calls).toEqual(['pipe1']); // pipe2 та handler не повинні бути викликані
  });

  it('повинен коректно обробляти порожній масив pipes', async () => {
    const calls: string[] = [];
    const handler = async (ctx: any) => {
      calls.push('handler');
    };

    const composedHandler = compose([], handler);
    await composedHandler({});

    expect(calls).toEqual(['handler']);
  });

  it('повинен передавати контекст між pipes та до handler', async () => {
    const pipe1 = async (ctx: any) => {
      ctx.value1 = 'hello';
    };
    const pipe2 = async (ctx: any) => {
      ctx.value2 = ctx.value1 + ' world';
    };
    const handler = async (ctx: any) => {
      expect(ctx.value1).toBe('hello');
      expect(ctx.value2).toBe('hello world');
      ctx.final = true;
    };

    const context = {};
    const composedHandler = compose([pipe1, pipe2], handler);
    await composedHandler(context);

    expect((context as any).final).toBe(true);
  });
});
