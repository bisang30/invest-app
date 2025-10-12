// This service uses a public CORS proxy to access finance websites.
// This is necessary because these websites do not provide the required CORS headers
// for direct browser access from a web application.
const PROXY_URL = 'https://api.allorigins.win/raw?url=';

// A demo key is used for Alpha Vantage as a final fallback.
// In a production environment, this should be stored securely.
const ALPHA_VANTAGE_API_KEY = 'demo';

// Helper to introduce a delay, used for rate-limiting API calls.
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface FetchStockPricesResult {
  prices: { [key: string]: number };
  errors: { [key: string]: string };
}

export interface StockHistoryPoint {
  date: string;
  price: number;
}

// Helper to parse price strings like "123,456.78" into a number.
const parsePrice = (priceStr: string | null | undefined): number | null => {
  if (!priceStr) return null;
  const num = parseFloat(priceStr.replace(/,/g, ''));
  return isNaN(num) ? null : num;
};

/**
 * Fetches data from a URL via the CORS proxy.
 * @param url The target URL to fetch.
 * @returns A promise that resolves to the raw Response object.
 */
const fetchWithProxy = async (url: string): Promise<Response> => {
    const proxiedUrl = `${PROXY_URL}${encodeURIComponent(url)}`;
    const response = await fetch(proxiedUrl);
    if (!response.ok) {
        throw new Error(`Proxy request failed with status ${response.status} for URL: ${url}`);
    }
    return response;
};

/**
 * Fetches the latest stock prices using a multi-layered approach with fallbacks.
 * 1. Naver Finance (Web Scraping)
 * 2. Yahoo Finance (Web Scraping)
 * 3. Google Finance (Web Scraping)
 * 4. Alpha Vantage (API)
 * @param tickers An array of stock tickers.
 * @returns A promise that resolves to an object with prices and errors.
 */
export const fetchStockPrices = async (tickers: string[]): Promise<FetchStockPricesResult> => {
    const originalUniqueTickers = [...new Set(tickers)];
    const prices: { [ticker: string]: number } = {};
    const fetchErrors: { [ticker: string]: string[] } = {};
    const validationErrors: { [key: string]: string } = {};
    const validTickers: string[] = [];

    // --- Ticker Validation ---
    const tickerRegex = /^[A-Z0-9]{6}$/;
    for (const ticker of originalUniqueTickers) {
        if (typeof ticker === 'string' && tickerRegex.test(ticker)) {
            validTickers.push(ticker);
        } else {
            const errorMessage = `Invalid ticker format: '${ticker}'. Must be 6 uppercase alphanumeric characters. Skipping fetch.`;
            console.error(errorMessage);
            validationErrors[ticker] = errorMessage;
        }
    }

    if (validTickers.length === 0) {
        return { prices, errors: validationErrors };
    }
    
    let remainingTickers = [...validTickers];

    // --- Stage 1: Naver Finance ---
    if (remainingTickers.length > 0) {
        console.log(`Attempt 1: Fetching ${remainingTickers.length} tickers from Naver Finance...`);
        const promises = remainingTickers.map(async (ticker) => {
            try {
                const response = await fetchWithProxy(`https://finance.naver.com/item/main.nhn?code=${ticker}`);
                const html = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');

                const priceElement = doc.querySelector('#chart_area .today .blind');
                if (!priceElement) throw new Error("Price element not found on Naver page.");
                
                const price = parsePrice(priceElement.textContent);
                if (price === null) throw new Error("Could not parse price from Naver page.");
                
                return { ticker, price };
            } catch (error) {
                if (!fetchErrors[ticker]) fetchErrors[ticker] = [];
                fetchErrors[ticker].push(`Naver: ${error instanceof Error ? error.message : String(error)}`);
                return { ticker, price: null };
            }
        });

        const results = await Promise.all(promises);
        const successfullyFetched = new Set<string>();
        results.forEach(result => {
            if (result.price !== null) {
                prices[result.ticker] = result.price;
                successfullyFetched.add(result.ticker);
            }
        });
        remainingTickers = remainingTickers.filter(t => !successfullyFetched.has(t));
    }
    
    if (remainingTickers.length > 0) await delay(500);

    // --- Stage 2: Yahoo Finance ---
    if (remainingTickers.length > 0) {
        console.log(`Attempt 2: Fetching ${remainingTickers.length} tickers from Yahoo Finance...`);
        const promises = remainingTickers.map(async (ticker) => {
            const yahooTicker = `${ticker}.KS`;
            try {
                const response = await fetchWithProxy(`https://finance.yahoo.com/quote/${yahooTicker}`);
                const html = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');

                const priceElement = doc.querySelector(`fin-streamer[data-symbol="${yahooTicker}"]`);
                if (!priceElement) throw new Error("Price element not found on Yahoo page.");
                
                const price = parsePrice(priceElement.getAttribute('value'));
                if (price === null) throw new Error("Could not parse price from Yahoo page.");

                return { ticker, price };
            } catch (error) {
                if (!fetchErrors[ticker]) fetchErrors[ticker] = [];
                fetchErrors[ticker].push(`Yahoo: ${error instanceof Error ? error.message : String(error)}`);
                return { ticker, price: null };
            }
        });

        const results = await Promise.all(promises);
        const successfullyFetched = new Set<string>();
        results.forEach(result => {
            if (result.price !== null) {
                prices[result.ticker] = result.price;
                successfullyFetched.add(result.ticker);
            }
        });
        remainingTickers = remainingTickers.filter(t => !successfullyFetched.has(t));
    }
  
    if (remainingTickers.length > 0) await delay(500);

    // --- Stage 3: Google Finance ---
    if (remainingTickers.length > 0) {
        console.log(`Attempt 3: Fetching ${remainingTickers.length} tickers from Google Finance...`);
        const promises = remainingTickers.map(async (ticker) => {
            const googleTicker = `KRX:${ticker}`;
            try {
                const response = await fetchWithProxy(`https://www.google.com/finance/quote/${googleTicker}`);
                const html = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');

                const priceElement = doc.querySelector('.YMlKec.fxKbKc');
                if (!priceElement) throw new Error("Price element not found on Google page.");

                const price = parsePrice(priceElement.textContent);
                if (price === null) throw new Error("Could not parse price from Google page.");

                return { ticker, price };
            } catch (error) {
                if (!fetchErrors[ticker]) fetchErrors[ticker] = [];
                fetchErrors[ticker].push(`Google: ${error instanceof Error ? error.message : String(error)}`);
                return { ticker, price: null };
            }
        });
        const results = await Promise.all(promises);
        const successfullyFetched = new Set<string>();
        results.forEach(result => {
            if (result.price !== null) {
                prices[result.ticker] = result.price;
                successfullyFetched.add(result.ticker);
            }
        });
        remainingTickers = remainingTickers.filter(t => !successfullyFetched.has(t));
    }
  
    // --- Stage 4: Alpha Vantage API ---
    if (remainingTickers.length > 0) {
        console.log(`Attempt 4: Fetching ${remainingTickers.length} tickers from Alpha Vantage API...`);
        const BATCH_SIZE = 5;
        for (let i = 0; i < remainingTickers.length; i += BATCH_SIZE) {
            const batch = remainingTickers.slice(i, i + BATCH_SIZE);
            console.log(`Fetching Alpha Vantage batch: ${batch.join(', ')}`);
            
            const promises = batch.map(async (ticker) => {
                const alphaTicker = `${ticker}.KS`;
                try {
                    // Alpha Vantage API supports CORS, but we use the proxy for consistency.
                    const response = await fetchWithProxy(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${alphaTicker}&apikey=${ALPHA_VANTAGE_API_KEY}`);
                    const data = await response.json();

                    const priceStr = data?.['Global Quote']?.['05. price'];
                    if (!priceStr) throw new Error(data['Information'] || "Invalid API response structure from Alpha Vantage.");

                    const price = parsePrice(priceStr);
                    if (price === null) throw new Error("Could not parse price from Alpha Vantage API.");

                    return { ticker, price };
                } catch (error) {
                    if (!fetchErrors[ticker]) fetchErrors[ticker] = [];
                    fetchErrors[ticker].push(`AlphaVantage: ${error instanceof Error ? error.message : String(error)}`);
                    return { ticker, price: null };
                }
            });

            const results = await Promise.all(promises);
            results.forEach(result => {
                if (result.price !== null) {
                    prices[result.ticker] = result.price;
                }
            });

            if (i + BATCH_SIZE < remainingTickers.length) {
                console.log("Waiting 65 seconds before next Alpha Vantage batch...");
                await delay(65000);
            }
        }
    }

    const finalErrors: { [ticker: string]: string } = { ...validationErrors };
    validTickers.forEach(ticker => {
        if (!(ticker in prices)) {
            finalErrors[ticker] = (fetchErrors[ticker] || ['All fetch attempts failed.']).join(' | ');
        }
    });

    return { prices, errors: finalErrors };
};


/**
 * Fetches up to one year of daily historical stock prices for a given ticker from Naver Finance.
 * @param ticker The stock ticker.
 * @returns A promise that resolves to an array of historical data points.
 */
export const fetchStockHistory = async (ticker: string): Promise<StockHistoryPoint[]> => {
    const tickerRegex = /^[A-Z0-9]{6}$/;
    if (typeof ticker !== 'string' || !tickerRegex.test(ticker)) {
        const errorMessage = `Invalid ticker format for history fetch: '${ticker}'. Must be 6 uppercase alphanumeric characters.`;
        console.error(errorMessage);
        throw new Error(errorMessage);
    }

    const url = `https://api.finance.naver.com/item/siseDaily.naver?code=${ticker}&page=1&count=250`;
    
    const response = await fetchWithProxy(url);
    const data = await response.json();
    
    // Expected structure: `[["날짜", "종가", ...], ["20240726", 81500, ...], ...]`
    if (!Array.isArray(data) || data.length < 2 || !Array.isArray(data[1])) {
        throw new Error("Invalid data format received from Naver history API.");
    }

    // The first element is the header row, which we skip.
    const historyData = data.slice(1);

    const formattedHistory = historyData.map((row: any[]) => {
        const dateStr = String(row[0]);
        return {
            date: `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`,
            price: Number(row[1]), // Closing price is at index 1
        };
    }).filter(point => !isNaN(point.price) && point.date);

    // The API returns data from newest to oldest, so we reverse it for chronological charting.
    return formattedHistory.reverse();
};