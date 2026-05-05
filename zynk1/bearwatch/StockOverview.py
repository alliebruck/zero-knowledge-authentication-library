from bs4 import BeautifulSoup
import requests

def get_stock_overview(ticker):
    url = f"https://stockanalysis.com/stocks/{ticker.lower()}/"
    response = requests.get(url)

    if response.status_code != 200:
        print(f"Failed to retrieve data for {ticker}")
        return None

    soup = BeautifulSoup(response.text, 'html.parser')
    overview = {}

    # Stock name
    name_tag = soup.find('h1')
    if name_tag:
        overview['Name'] = name_tag.text.strip()

    # Locate all overview tables
    tables = soup.find_all('table', {'data-test': ['overview-info', 'overview-quote']})

    for table in tables:
        rows = table.find_all('tr')
        for row in rows:
            cells = row.find_all('td')
            if len(cells) == 2:
                label = cells[0].get_text(strip=True)
                value = cells[1].get_text(strip=True)
                overview[label] = value

    return overview