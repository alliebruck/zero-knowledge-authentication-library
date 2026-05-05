import yfinance as yf
import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import StandardScaler
import requests
import numpy as np

# Function to get company info
def get_company_info(ticker):
    stock = yf.Ticker(ticker)
    info = stock.info
    return {
        "Ticker": ticker,
        "Company Name": info.get('longName', 'N/A'),
        "Sector": info.get('sector', 'N/A'),
        "Industry": info.get('industry', 'N/A'),
        "Market Cap": info.get('marketCap', 0),
        "P/E Ratio": info.get('trailingPE', 0),
        "P/B Ratio": info.get('priceToBook', 0),
        "Gross Margin": info.get('grossMargins', 0),
        "Operating Margin": info.get('operatingMargins', 0),
        "Dividend Yield": info.get('dividendYield', 0),
        "D/E Ratio": info.get('debtToEquity', 0),
        "Beta": info.get('beta', 0),  # Volatility indicator
        "Revenue Growth": info.get('revenueGrowth', 0),  # Growth potential
        "Free Cash Flow": info.get('freeCashflow', 0)  # Financial strength
    }

# Function to build feature matrix
def build_feature_matrix(tickers):
    data = []
    for ticker in tickers:
        data.append(get_company_info(ticker))
    df = pd.DataFrame(data)
    
    # Ensure all feature columns are numeric and fill missing values with 0
    numeric_columns = ['Market Cap', 'P/E Ratio', 'P/B Ratio', 'Gross Margin', 'Operating Margin', 'Dividend Yield', 'D/E Ratio','Beta', 'Revenue Growth', 'Free Cash Flow']
    df[numeric_columns] = df[numeric_columns].apply(pd.to_numeric, errors='coerce')
    df[numeric_columns] = df[numeric_columns].fillna(df[numeric_columns].median())  # Fill with median
    
    return df

# Function to recommend stocks
def recommend_stocks(input_ticker, df, top_n=5):
    numeric_columns = ['Market Cap', 'P/E Ratio', 'P/B Ratio', 'Gross Margin', 
                       'Operating Margin', 'Dividend Yield', 'D/E Ratio', 
                       'Beta', 'Revenue Growth', 'Free Cash Flow']

    # Ensure 'Ticker' is a string
    df['Ticker'] = df['Ticker'].astype(str)

    # If the input stock is not in the dataset, fetch its data and add it
    if input_ticker not in df['Ticker'].values:
        input_data = get_company_info(input_ticker)  # Fetch stock data
        df = df._append(input_data, ignore_index=True)
    
    # Re-check the index after appending
    input_index = df[df['Ticker'] == input_ticker].index[0]  

    # Ensure only valid numeric columns are used
    available_columns = [col for col in numeric_columns if col in df.columns]
    features = df[available_columns]
    features = features.replace([np.inf, -np.inf], np.nan)
    features = features.dropna()

    # Standardize features **AFTER appending the new stock**
    scaler = StandardScaler()
    scaled_features = scaler.fit_transform(features)

    # Compute cosine similarity **only for the input stock**
    similarity_scores = cosine_similarity([scaled_features[input_index]], scaled_features)[0]

    # Sort stocks by similarity
    top_indices = similarity_scores.argsort()[::-1][1:top_n+1]  # Exclude itself
    top_stocks = df.iloc[top_indices]['Ticker'].tolist()

    return top_stocks
# Function to get tickers from Finviz API
def get_tickers_from_finviz(sector,market_cap):
    sector = sector.replace(" ", "").lower()  # Replace spaces with underscores and convert to lowercase
    url = "https://finviz-screener.p.rapidapi.com/table"
    if market_cap < 2000000000: #all market cap values subject to change
        size = "small"
    elif market_cap < 10000000000:
        size = "mid"
    elif market_cap < 200000000000:
        size = "large"
    else:
        size = "mega"
    querystring = {
        "order": "marketcap",
        "desc": "true",
        "filters": {f"cap_{size}":"1",f"sec_{sector}":"1"}  # Using sector filter and market cap filter f"sec_{sector}":"0",
        #"filters": {f"sec_{sector}": f"cap_small"}  # Using sector filter and large market cap filter
    }
    headers = {
        "x-rapidapi-key": "748fc92ca0msh7c97cc39471de49p1f5cd3jsn8056f65dc34a",
        "x-rapidapi-host": "finviz-screener.p.rapidapi.com"
    }
    response = requests.get(url, headers=headers, params=querystring)
    
    if response.status_code == 200:
        try:
            data = response.json()
            tickers = [row[1] for row in data['rows']]
            return tickers
        except requests.exceptions.JSONDecodeError:
            print("Error decoding JSON response")
            print("Raw response text:", response.text)
            return []
    else:
        print(f"Request failed with status code {response.status_code}")
        print(response.text)
        return []

# Main function to integrate both pieces of code
def get_related_stocks(input_ticker):
    # Get the sector of the input ticker
    input_info = get_company_info(input_ticker)
    sector = input_info['Sector']
    market_cap = input_info['Market Cap']

    
    if sector != 'N/A':
        tickers = get_tickers_from_finviz(sector,market_cap)
        if tickers:
            df = build_feature_matrix(tickers)
            recommended_stocks = recommend_stocks(input_ticker, df)
            if recommended_stocks:
                similar_stocks = []
                for s in recommended_stocks:
                    try:
                        ticker_obj = yf.Ticker(s)
                        info = ticker_obj.info
                        price = info.get("regularMarketPrice", 'N/A')
                        change = info.get("regularMarketChange", 'N/A')
                        change_percent = info.get("regularMarketChangePercent", 'N/A')
                    except Exception as e:
                        
                        price = change = change_percent = 'N/A'
                    similar_stocks.append({
                        "ticker": s,
                        "price": price,
                        "change": change,
                        "change_percent": change_percent
                    })
            return similar_stocks


        else:
            print("No tickers found from Finviz API")
    else:
        print(f"Sector information not available for {input_ticker}")