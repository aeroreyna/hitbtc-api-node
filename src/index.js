import WebsocketClient from './websocketClient';
import axios from 'axios';
import crypto from 'crypto';
import get from 'lodash/fp/get';
import keyBy from 'lodash/fp/keyBy';
import map from 'lodash/fp/map';
import mapValues from 'lodash/fp/mapValues';
import shortid from 'shortid';
import { stringify } from 'qs';

// Convert order book entries to a more convenient format
const labelOrderBookEntries = mapValues(
  map(([price, volume]) => ({ price, volume })),
);

// Ditto for the balance data
const formatBalanceData = mapValues(keyBy(get(`currency_code`)));

const uri = (path, params) =>
  `${path}?${stringify(params)}`;

export default class HitBTC {
  static WebsocketClient = WebsocketClient;

  constructor({ key, secret, isDemo = false } = { isDemo: false }) {
    this.key = key;
    this.secret = secret;
    const subdomain = isDemo ? `demo-api` : `api`;
    this.baseUrl = `http://${subdomain}.hitbtc.com`;
    this.url = `${this.baseUrl}/api/1`;
  }

  requestPublic = (endpoint, params = {}) =>
    axios.get(`${this.url}/public${endpoint}`, { params })
      .then(get(`data`))
      .catch(get(`response.data`));

  getTimestamp = () =>
    this.requestPublic(`/time`);

  getSymbols = () =>
    this.requestPublic(`/symbols`);

  getTicker = symbol =>
    this.requestPublic(`/${symbol}/ticker`);

  getAllTickers = () =>
    this.requestPublic(`/ticker`);

  getOrderBook = symbol =>
    this.requestPublic(`/${symbol}/orderbook`, {
      format_amount: `number`,
      format_price: `number`,
    })
    .then(labelOrderBookEntries);

  getTrades = (symbol, params = {}) =>
    this.requestPublic(`/${symbol}/trades`, {
      format_amount: `number`,
      format_item: `object`,
      format_price: `number`,
      ...params,
    })

  getRecentTrades = (symbol, params = {}) =>
    this.requestPublic(`/${symbol}/trades/recent`, {
      max_results: 100,
      format_item: `object`,
      ...params,
    })

  requestPrivate = (endpoint, method, params = {}) => {
    if (!this.key || !this.secret) {
      throw new Error(
        `API key and secret key required to use authenticated methods`,
      );
    }

    const path = `/api/1${endpoint}`;

    // All requests include these
    const authParams = {
      apikey: this.key,
      nonce: Date.now(),
    };

    // If this is a GET request, all params go in the URL.
    // Otherwise, only the auth-related ones do.
    const requestPath = uri(path,
      method === `get` ?
        { ...authParams, ...params } :
        authParams,
    );

    const requestUrl = `${this.baseUrl}${requestPath}`;

    // Compute the message to encrypt for the signature.
    const message =
      method === `get` ?
        requestPath :
        `${requestPath}${stringify(params)}`;

    const signature = crypto
      .createHmac(`sha512`, this.secret)
      .update(message)
      .digest(`hex`);

    const config = {
      headers: {
        'X-Signature': signature,
      },
    };

    // Figure out the arguments to pass to axios.
    const args =
      method === `get` ?
        [config] :
        [stringify(params), config];

    return axios[method](requestUrl, ...args)
      .then(get(`data`))
      .catch(get(`response.data`));
  }

  getMyBalance = () =>
    this.requestPrivate(`/trading/balance`, `get`, {})
      .then(formatBalanceData);

  getMyActiveOrders = (params = {}) =>
    this.requestPrivate(`/trading/orders/active`, `get`, params);

  placeOrder = (params = {}) =>
    this.requestPrivate(`/trading/new_order`, `post`, {
      clientOrderId: shortid(),
      ...params,
    });

  cancelOrder = (params = {}) =>
    this.requestPrivate(`/trading/cancel_order`, `post`, {
      cancelRequestClientOrderId: shortid(),
      ...params,
    });

  cancelAllOrders = (params = {}) =>
    this.requestPrivate(`/trading/cancel_orders`, `post`, params);

  getMyRecentOrders = (params = {}) =>
    this.requestPrivate(`/trading/orders/recent`, `get`, {
      max_results: 100,
      sort: `desc`,
      ...params,
    });

  getMyOrder = (params = {}) =>
    this.requestPrivate(`/trading/order`, `get`, params);

  getMyTradesByOrder = (params = {}) =>
    this.requestPrivate(`/trading/trades/by/order`, `get`, params);

  getAllMyTrades = (params = {}) =>
    this.requestPrivate(`/trading/trades`, `get`, {
      by: `trade_id`,
      max_results: 100,
      start_index: 0,
      sort: `desc`,
      ...params,
    });

  getPaymentBalance = (params = {}) =>
    this.requestPrivate(`/payment/balance`, `get`, params);

  getPaymentAddress = (params = {}) =>
    this.requestPrivate(`/payment/address/${params.currency}`, `get`, params);

  createPaymentAddress = (params = {}) =>
    this.requestPrivate(`/payment/address/${params.currency}`, `post`, params);

  getAllPaymentTransactions = (params = {}) =>
    this.requestPrivate(`/payment/transactions`, `get`, {
      limit: 100,
      ...params
    });

  getPaymentTransaction = (params = {}) =>
    this.requestPrivate(`/payment/transactions/${params.id}`, `get`, params);

  transferToTraging = (params = {}) =>
    this.requestPrivate(`/payment/transfer_to_trading`, `post`, params);
    // Required: amount & currency_code

  transferToMain = (params = {}) =>
    this.requestPrivate(`/payment/transfer_to_main`, `post`, params);
    // Required: amount & currency_code

  withdrawToAddress = (params = {}) =>
    this.requestPrivate(`/payment/payout`, `post`, params);
    // Required: amount & currency_code & address

}
