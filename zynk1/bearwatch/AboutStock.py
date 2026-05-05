from bs4 import BeautifulSoup
import requests

def get_stock_about(ticker):
    url = f"https://stockanalysis.com/stocks/{ticker.lower()}/"
    response = requests.get(url)

    if response.status_code != 200:
        print(f"Failed to retrieve data for {ticker}")
        return None

    soup = BeautifulSoup(response.text, 'html.parser')

    # Look for the paragraph under the "About" section
    about_section = soup.find('h2', string=lambda t: t and 'About' in t)
    if about_section:
        # Usually the <p> tag follows the <h2> with "About"
        about_paragraph = about_section.find_next('p')
        if about_paragraph:
            return about_paragraph.text.strip()

    return "No 'About' info found."
