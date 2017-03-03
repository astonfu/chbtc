var util = require('util'),
    _ = require('underscore'),
    request	= require('request'),
    crypto = require('crypto'),
    VError = require('verror'),
    cheerio = require('cheerio');

var CHBTC = function CHBTC(key, secret, server, timeout)
{
    this.key = key;
    this.secret = secret;

    this.server = server || 'http://api.chbtc.com';

    this.timeout = timeout || 30000;
};

CHBTC.prototype.signMessage = function getMessageSignature(params)
{
    var formattedParams = formatParameters(params);
    // TODO: sign
    // append secret key value pair
    formattedParams += '&secret_key=' + this.secret;

    return md5(formattedParams).toUpperCase();
};

/**
 * This method returns the parameters as key=value pairs separated by & sorted by the key
 * @param  {Object}  params   The object to encode
 * @return {String}           formatted parameters
 */
function formatParameters(params)
{
    var sortedKeys = [],
        formattedParams = '';

    // sort the properties of the parameters
    sortedKeys = _.keys(params).sort();

    // create a string of key value pairs separated by '&' with '=' assignement
    for (i = 0; i < sortedKeys.length; i++)
    {
        if (i != 0) {
            formattedParams += '&';
        }
        formattedParams += sortedKeys[i] + '=' + params[sortedKeys[i]];
    }

    return formattedParams;
}


CHBTC.prototype.privateRequest = function(method, params, callback)
{
    var functionName = 'CHBTC.privateRequest()',
        self = this;

    if(!this.key || !this.secret)
    {
        var error = new VError('%s must provide key and secret to make this API request.', functionName);
        return callback(error);
    }

    if(!_.isArray(params))
    {
        var error = new VError('%s second parameter %s must be an array. If no params then pass an empty array []', functionName, params);
        return callback(error);
    }

    if (!callback || typeof(callback) != 'function')
    {
        var error = new VError('%s third parameter needs to be a callback function', functionName);
        return callback(error);
    }

    var headers = {
        "User-Agent": "CHBTC Javascript API Client",
    };

    params.method = method;
    params.accesskey = this.key;
    params.sign = this.signMessage(params);
    params.reqTime = new Date() * 1000;

    var options = {
        url: "https://trade.chbtc.com/api/" + method + "/" + formatParameters(params),
        method: 'GET',
        headers: headers,
        timeout: this.timeout,
        qs: params,
        json: {}
    };

    var requestDesc = util.format('%s request to url %s with method %s and params %s',
        options.method, options.url, method, JSON.stringify(params));

    executeRequest(options, requestDesc, callback);
};

CHBTC.prototype.publicRequest = function(method, params, callback)
{
    var functionName = 'CHBTC.publicRequest()';

    if(!_.isObject(params))
    {
        var error = new VError('%s second parameter %s must be an object. If no params then pass an empty object {}', functionName, params);
        return callback(error);
    }

    if (!callback || typeof(callback) != 'function')
    {
        var error = new VError('%s third parameter needs to be a callback function with err and data parameters', functionName);
        return callback(error);
    }

    var headers = {"User-Agent": "CHBTC Javascript API Client"};

    var url = this.server + '/data/v1/' + method;

    var options = {
        url: url,
        method: 'GET',
        headers: headers,
        timeout: this.timeout,
        qs: params,
        json: {}        // request will parse the json response into an object
    };

    var requestDesc = util.format('%s request to url %s with parameters %s',
        options.method, options.url, JSON.stringify(params));

    executeRequest(options, requestDesc, callback)
};

function executeRequest(options, requestDesc, callback)
{
    var functionName = 'CHBTC.executeRequest()';

    request(options, function(err, response, data)
    {
        var error = null;   // default to no errors

        if(err)
        {
            error = new VError(err, '%s failed %s', functionName, requestDesc);
            error.name = err.code;
        }
        else if (response.statusCode < 200 || response.statusCode >= 300)
        {
            error = new VError('%s HTTP status code %s returned from %s. Status message: %s', functionName,
                response.statusCode, requestDesc, response.statusMessage);
            error.name = response.statusCode;
        }
        // if request was not able to parse json response into an object
        else if (!_.isObject(data) )
        {
            error = new VError('%s could not parse response from %s\n. HTTP status code %s. Response: %s', functionName, requestDesc, response.statusCode, data);
            error.name = data;
        }
        else if (_.has(data, 'error'))
        {
            error = new VError('%s API returned error code %s from %s\nError message: %s', functionName,
                data.error.code, requestDesc, data.error.message);
            error.name = data.error.message;
        }

        callback(error, data);
    });
}

function constructParamArray(args, maxArgs)
{
    var paramArray = [];

    for (i = 1; i <= maxArgs; i++)
    {
        // if the argument is undefined
        if (_.isUndefined(args[i]))
            break;
        else
            paramArray.push(args[i]);
    }

    return paramArray;
}

//
// Public Functions
//

CHBTC.prototype.getTicker = function getTicker(callback, market)
{
    this.publicRequest('ticker', {currency: market}, callback);
};

CHBTC.prototype.getOrderBook = function getOrderBook(callback, market, limit)
{
    var params = {market: market};

    // add limit to parameters if it was passed to this function
    if (limit) params.limit = limit;

    this.publicRequest('orderbook', params, callback);
};

CHBTC.prototype.getHistoryData = function getHistoryData(callback, params)
{
    this.publicRequest('historydata', params, callback);
};

CHBTC.prototype.getTrades = function getTrades(callback, market, params)
{
    params = _.extend({currency: market}, params);

    this.publicRequest('trades', params, callback);
};

//
// Private Functions
//

CHBTC.prototype.buyOrder2 = function buyOrder2(callback, price, amount, market)
{
    var params = constructParamArray(arguments, 3);

    this.privateRequest('buyOrder2', params, callback);
};

CHBTC.prototype.sellOrder2 = function sellOrder2(callback, price, amount, market)
{
    var params = constructParamArray(arguments, 3);

    this.privateRequest('sellOrder2', params, callback);
};

// calls either buyOrder2 or sellOrder2 functions depending on the second type parameter
CHBTC.prototype.createOrder2 = function createOrder2(callback, type, price, amount, market)
{
    var functionName = 'CHBTC.createOrder2()',
        // rest removes the first element of the array
        params = constructParamArray(_.rest(arguments), 3);

    if (type === 'buy')
    {
        this.privateRequest('buyOrder2', params, callback);
    }
    else if (type === 'sell')
    {
        this.privateRequest('sellOrder2', params, callback);
    }
    else
    {
        var error = new VError('%s second parameter type "%s" needs to be either "buy" or "sell"', functionName, type);
        callback(error);
    }
};

CHBTC.prototype.cancelOrder = function cancelOrder(callback, id, market)
{
    var params = constructParamArray(arguments, 2);

    this.privateRequest('cancelOrder', params, callback);
};

CHBTC.prototype.getOrders = function getOrders(callback, openOnly, market, limit, offset, since, withDetail)
{
    var params = constructParamArray(arguments, 6);

    this.privateRequest('getOrders', params, callback);
};

CHBTC.prototype.getOrder = function getOrder(callback, id, market, withDetail)
{
    var params = constructParamArray(arguments, 3);

    this.privateRequest('getOrder', params, callback);
};

CHBTC.prototype.getTransactions = function getTransactions(callback, type, limit, offset, since, sinceType)
{
    var params = constructParamArray(arguments, 5);

    this.privateRequest('getTransactions', params, callback);
};

CHBTC.prototype.getMarketDepth2 = function getMarketDepth2(callback, limit, market)
{
    var params = constructParamArray(arguments, 2);

    this.privateRequest('getMarketDepth2', params, callback);
};

CHBTC.prototype.getDeposits = function getDeposits(callback, currency, pendingOnly)
{
    var params = constructParamArray(arguments, 2);

    this.privateRequest('getDeposits', params, callback);
};

CHBTC.prototype.getWithdrawal = function getWithdrawal(callback, id, currency)
{
    var params = constructParamArray(arguments, 2);

    this.privateRequest('getWithdrawal', params, callback);
};

CHBTC.prototype.getWithdrawals = function getWithdrawals(callback, currency, pendingOnly)
{
    var params = constructParamArray(arguments, 2);

    this.privateRequest('getWithdrawals', params, callback);
};

CHBTC.prototype.requestWithdrawal = function requestWithdrawal(callback, currency, amount)
{
    var params = constructParamArray(arguments, 2);

    this.privateRequest('requestWithdrawal', params, callback);
};

CHBTC.prototype.getAccountInfo = function getAccountInfo(callback, type)
{
    var params = constructParamArray(arguments, 1);

    this.privateRequest('getAccountInfo', params, callback);
};

/**
 * Screen scraps the fiat deposit and withdrawal exchange rates from BTCC's website
 * @param callback (err: Error, depositRate: number, withdrawalRate: number): void
 * @param baseCurrency USD in USD/CNY
 * @param quoteCurrency CNY in USD/CNY
 */
CHBTC.prototype.getFiatExchangeRates = function getFiatExchangeRates(callback, baseCurrency, quoteCurrency)
{
    var options = {
        url: "https://exchange.btcc.com/page/internationalvoucher",
        method: 'GET',
        timeout: this.timeout
    };

    var requestDesc = util.format('%s request to url %s',
        options.method, options.url);

    request(options, function(err, response, html)
    {
        var error;

        if(err)
        {
            error = new VError(err, 'failed %s', requestDesc);
            error.name = err.code;
            return callback(error);
        }
        else if (response.statusCode < 200 || response.statusCode >= 300)
        {
            error = new VError('HTTP status code %s returned from %s. Status message: %s',
                response.statusCode, requestDesc, response.statusMessage);
            error.name = response.statusCode;
            return callback(error);
        }
        else if (!html)
        {
            error = new VError('no HTML response from %s', requestDesc);
            return callback(error);
        }

        parserCurrencies(html, callback);
    });
};

function parserCurrencies(html, callback)
{
    var returnRates = {},
        returnError;

    // for each currency that can be convered to CNY
    ['USD','CNH','HKD','EUR'].forEach(function(baseCurrency)
    {
        var rates = parserRates(baseCurrency, 'CNY', html);

        if (rates instanceof Error)
        {
            returnError = rates;
        }
        else
        {
            returnRates[baseCurrency + 'CNY'] = rates;
        }
    })

    callback(returnError, returnRates);
}

function parserRates(baseCurrency, quoteCurrency, html)
{
    var symbol = baseCurrency + '/' + quoteCurrency;

    // try and parse HTML body form response
    $ = cheerio.load(html);
    var rateRow = $("table tr:contains('" + symbol +"')");

    if (rateRow.length > 0)
    {
        var depositRate = rateRow.children().eq(1).text();
        var withdrawalRate = rateRow.children().eq(2).text();

        return {
            deposit: Number(depositRate),
            withdrawal: Number(withdrawalRate)
        };
    }
    else
    {
        return new VError('Could not find exchange rate for symbol %s', symbol);
    }
}

module.exports = CHBTC;
