import { divide } from './math.js';

export function buildQuoteHandler() {
  return {
    path: '/quote',
    method: 'GET',
    handle(request: { query?: Record<string, string> }) {
      const quantity = Number(request.query?.quantity ?? '0');
      return { quote: divide(100, quantity) };
    }
  };
}
