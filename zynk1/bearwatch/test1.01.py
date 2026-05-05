import os
import re
import functools
import datetime
import json
import random
import yfinance as yf
import requests
from bs4 import BeautifulSoup
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from dash import Dash, dcc, html, Input, Output
import plotly.graph_objs as go
from urllib.parse import parse_qs, urlencode
from RelatedStocks import get_related_stocks
from StockOverview import get_stock_overview
from AboutStock import get_stock_about
from TrendingStocks import get_trending_stocks
from database import init_db, get_db
from auth_zk import verify_zk_proof

def load_local_env():
    env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '.env'))
    if not os.path.exists(env_path):
        return
    with open(env_path, encoding='utf-8') as env_file:
        for raw_line in env_file:
            line = raw_line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value

load_local_env()

server = Flask(__name__)
server.secret_key = os.environ.get('BEARWATCH_SECRET', 'bearwatch-dev-session-secret')

with server.app_context():
    init_db()

home_tickers = {
    "S&P 500": "^GSPC",
    "NASDAQ": "^IXIC",
    "Dow Jones": "^DJI"
}

AUTH_CHALLENGE_TTL_MS = 5 * 60 * 1000
latest_auth_event = None

# ─── Helpers ────────────────────────────────────────────────────────────────

def login_required(f):
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated

def get_current_user():
    if 'user_id' not in session:
        return None
    db = get_db()
    user = db.execute('SELECT * FROM users WHERE id = ?', (session['user_id'],)).fetchone()
    db.close()
    return dict(user) if user else None

def get_or_create_demo_agent_account():
    db = get_db()
    email = 'bearwatch-agent@zync.ai'
    user = db.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
    if not user:
        db.execute(
            'INSERT INTO users (email, pub_key, name, balance) VALUES (?, ?, ?, 10000.00)',
            (email, 'demo-bearwatch-agent-paper-key', 'AI Stock Agent')
        )
        db.commit()
        user = db.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
    db.close()
    return dict(user)

def create_demo_agent_account():
    timestamp = current_timestamp_ms()
    suffix = os.urandom(3).hex()
    email = f'bearwatch-agent-{timestamp}-{suffix}@zync.ai'
    db = get_db()
    db.execute(
        'INSERT INTO users (email, pub_key, name, balance) VALUES (?, ?, ?, 10000.00)',
        (email, f'demo-agent-paper-key-{timestamp}-{suffix}', 'AI Stock Agent')
    )
    db.commit()
    user = db.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
    db.close()
    return dict(user)

def get_or_create_demo_human_account():
    db = get_db()
    email = 'demo-human@bearwatch.local'
    user = db.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
    if not user:
        db.execute(
            'INSERT INTO users (email, pub_key, name, balance) VALUES (?, ?, ?, 10000.00)',
            (email, 'demo-human-paper-key', 'Demo User')
        )
        db.commit()
        user = db.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
    db.close()
    return dict(user)

def get_current_price(ticker):
    info = yf.Ticker(ticker.upper()).info
    price = info.get('currentPrice') or info.get('regularMarketPrice')
    if not price:
        raise ValueError('Could not retrieve current price')
    return float(price)

def execute_paper_buy(user_id, ticker, shares, ai_model=None, ai_reason=None):
    ticker = ticker.upper().strip()
    shares = float(shares)
    if not ticker or shares <= 0:
        raise ValueError('Invalid ticker or share quantity')

    price = get_current_price(ticker)
    total_cost = round(shares * price, 4)
    db = get_db()
    user = db.execute('SELECT balance FROM users WHERE id = ?', (user_id,)).fetchone()
    if not user:
        db.close()
        raise ValueError('Account not found')
    if user['balance'] < total_cost:
        db.close()
        raise ValueError(f'Insufficient funds. Need ${total_cost:.2f}, have ${user["balance"]:.2f}')

    db.execute('UPDATE users SET balance = balance - ? WHERE id = ?', (total_cost, user_id))
    existing = db.execute('SELECT shares, avg_price FROM portfolio WHERE user_id = ? AND ticker = ?',
                          (user_id, ticker)).fetchone()
    if existing:
        new_shares = existing['shares'] + shares
        new_avg = (existing['shares'] * existing['avg_price'] + total_cost) / new_shares
        db.execute('UPDATE portfolio SET shares = ?, avg_price = ? WHERE user_id = ? AND ticker = ?',
                   (new_shares, new_avg, user_id, ticker))
    else:
        db.execute('INSERT INTO portfolio (user_id, ticker, shares, avg_price) VALUES (?, ?, ?, ?)',
                   (user_id, ticker, shares, price))

    db.execute(
        'INSERT INTO trades (user_id, ticker, action, shares, price, total, ai_model, ai_reason) VALUES (?,?,?,?,?,?,?,?)',
        (user_id, ticker, 'buy', shares, price, total_cost, ai_model, ai_reason)
    )
    db.commit()
    new_balance = db.execute('SELECT balance FROM users WHERE id = ?', (user_id,)).fetchone()['balance']
    db.close()
    return {
        'ticker': ticker,
        'shares': shares,
        'price': price,
        'total': total_cost,
        'new_balance': new_balance,
    }

def extract_openai_text(response_json):
    if response_json.get('output_text'):
        return response_json['output_text']
    for item in response_json.get('output', []):
        if item.get('type') == 'message':
            parts = item.get('content', [])
            text = ''.join(part.get('text', '') for part in parts if part.get('type') == 'output_text')
            if text:
                return text
    return ''

def get_openai_trade_decision(agent, ticker_hint=None, shares_hint=None):
    api_key = os.environ.get('OPENAI_API_KEY')
    if not api_key:
        raise RuntimeError('OPENAI_API_KEY is not set on the server.')

    allowed_tickers = random.sample(['AAPL', 'MSFT', 'TSLA', 'NVDA', 'GOOGL'], 5)
    requested_ticker = (ticker_hint or '').upper().strip()
    requested_shares = shares_hint if shares_hint else 'none'
    model = os.environ.get('OPENAI_MODEL', 'gpt-4o-mini')
    db = get_db()
    recent_agent_trades = db.execute('''
        SELECT ticker, shares, created_at
        FROM trades
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 5
    ''', (agent['id'],)).fetchall()
    db.close()
    recent_summary = ', '.join(
        f'{row["shares"]} {row["ticker"]}' for row in recent_agent_trades
    ) or 'none'

    schema = {
        'type': 'object',
        'additionalProperties': False,
        'properties': {
            'ticker': {'type': 'string', 'enum': allowed_tickers},
            'shares': {'type': 'number', 'minimum': 0.0001, 'maximum': 5},
            'reason': {'type': 'string'},
        },
        'required': ['ticker', 'shares', 'reason'],
    }

    payload = {
        'model': model,
        'instructions': (
            'You are a paper-trading demo agent inside BearWatch. '
            'Choose one conservative paper stock trade. This is not real-money trading. '
            'Do not assume the user requested a specific ticker unless a hint is provided. '
            'When there is no hint, vary the ticker and share count across runs. '
            'Avoid choosing the same ticker as the account most recently traded when another allowed ticker is reasonable. '
            'Return only JSON that matches the schema.'
        ),
        'input': (
            f'Agent account: {agent["email"]}. Paper cash balance: ${agent["balance"]:.2f}. '
            f'Allowed tickers: {", ".join(allowed_tickers)}. '
            f'Recent trades in this agent account: {recent_summary}. '
            f'User UI hint ticker: {requested_ticker or "none"}. '
            f'User UI hint shares: {requested_shares}. '
            'Pick a ticker and a share amount between 1 and 5. Do not always choose 2 shares.'
        ),
        'temperature': 0.8,
        'text': {
            'format': {
                'type': 'json_schema',
                'name': 'paper_trade_decision',
                'schema': schema,
                'strict': True,
            }
        },
    }

    response = requests.post(
        'https://api.openai.com/v1/responses',
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
        },
        json=payload,
        timeout=30,
    )
    try:
        body = response.json()
    except ValueError:
        body = {'error': response.text}
    if response.status_code >= 400:
        message = body.get('error', {}).get('message') if isinstance(body.get('error'), dict) else body.get('error')
        raise RuntimeError(message or f'OpenAI API returned HTTP {response.status_code}.')

    text = extract_openai_text(body)
    try:
        decision = json.loads(text)
    except json.JSONDecodeError:
        raise RuntimeError('OpenAI did not return a valid JSON trade decision.')

    ticker = str(decision.get('ticker', '')).upper().strip()
    shares = float(decision.get('shares', 0))
    reason = str(decision.get('reason', '')).strip()
    if ticker not in allowed_tickers or shares <= 0 or shares > 5:
        raise RuntimeError('OpenAI returned a trade outside the demo guardrails.')
    return {
        'ticker': ticker,
        'shares': shares,
        'reason': reason,
        'model': model,
    }

def current_timestamp_ms():
    return int(datetime.datetime.now(datetime.timezone.utc).timestamp() * 1000)

def consume_auth_challenge(data):
    challenge = (data.get('challenge') or '').strip()
    try:
        timestamp = int(data.get('timestamp'))
    except (TypeError, ValueError):
        return None, None, 'Missing or invalid challenge timestamp'

    expected = session.pop('auth_challenge', None)
    if not expected:
        return None, None, 'Missing server challenge. Please try again.'
    if challenge != expected.get('challenge') or timestamp != expected.get('timestamp'):
        return None, None, 'Challenge mismatch. Please try again.'
    if current_timestamp_ms() - timestamp > AUTH_CHALLENGE_TTL_MS:
        return None, None, 'Challenge expired. Please try again.'
    return challenge, timestamp, None

def preview_hex(value, prefix=12, suffix=8):
    if not value:
        return ''
    return f'{value[:prefix]}...{value[-suffix:]}'

def record_auth_event(action, email, pub_key, proof, challenge, timestamp, verified, session_created):
    global latest_auth_event
    actor = 'stock agent' if email.endswith('@zync.ai') and (
        email.startswith('stock-agent-') or email.startswith('bearwatch-')
    ) else 'human user'
    event_time = datetime.datetime.now(datetime.timezone.utc)
    latest_auth_event = {
        'action': action,
        'actor': actor,
        'email': email,
        'pub_key_preview': preview_hex(pub_key),
        'challenge_preview': preview_hex(challenge),
        'timestamp': timestamp,
        'verified': verified,
        'challenge_consumed': True,
        'session_created': session_created,
        'created_at': event_time.strftime('%Y-%m-%d %H:%M:%S UTC'),
        'proof_preview': {
            'r': preview_hex((proof or {}).get('r', '')),
            's': preview_hex((proof or {}).get('s', '')),
        },
    }

def fetch_stock_data(ticker, pd="1d"):
    intervalsForPeriod = {"1d":"1m","5d":"1h","1mo":"1h","3mo":"1d","ytd":"1d","1y":"1d","max":"1d"}
    stock = yf.Ticker(ticker)
    df = stock.history(period=pd, interval=intervalsForPeriod[pd])
    return df

def determine_color(stock_symbol, colorblind_mode=False):
    stock = yf.Ticker(stock_symbol)
    data = fetch_stock_data(stock_symbol)
    current_price = stock.info.get("currentPrice", data["Close"].iloc[-1])
    prev_close = stock.info.get("previousClose", data["Close"].iloc[0])
    price_change = current_price - prev_close
    percent_change = (price_change / prev_close) * 100
    if colorblind_mode:
        line_color = "blue" if price_change > 0 else "orange"
    else:
        line_color = "green" if price_change > 0 else "red"
    sign = "+" if price_change > 0 else ""
    title = f"""
    {stock.info.get('shortName', stock_symbol)} <br>
    ${current_price:.2f} <span style='color:{line_color};'> <br>
    {sign}${price_change:.2f} ({sign}{percent_change:.2f}%) Today</span>
    """
    return line_color, title

# ─── News ───────────────────────────────────────────────────────────────────

def get_news(query="Stock Market", count=8, offset=0):
    try:
        result = yf.Search(query, news_count=(count + offset))
        if not result or not result.news:
            return []
        articles = []
        for a in result.news[offset:offset + count]:
            ts = a.get("providerPublishTime", 0)
            date_str = datetime.datetime.fromtimestamp(ts).strftime("%-m/%-d/%Y") if ts else ""
            tickers = a.get("relatedTickers", [])
            base = {
                "title": a.get("title", "No Title"),
                "link": a.get("link", "#"),
                "image": a.get("thumbnail", {}).get("resolutions", [{}])[0].get("url", ""),
                "publisher": a.get("publisher", ""),
                "date": date_str,
                "tickers": ",".join(tickers[:6]) if tickers else "",
            }
            base["article_url"] = _build_article_url(base)
            articles.append(base)
        return articles
    except Exception as e:
        print(f"Error fetching news: {e}")
        return []

def get_stock_news(stock_symbol, count=5):
    try:
        result = yf.Search(stock_symbol, news_count=count)
        if not result or not result.news:
            return []
        return [{"title": a.get("title", "No Title"), "link": a.get("link", "#"),
                 "image": a.get("thumbnail", {}).get("resolutions", [{}])[0].get("url", "https://via.placeholder.com/70")}
                for a in result.news[:count]]
    except Exception as e:
        print(f"Stock News Error: {e}")
        return []

def get_main_news(query="Stock Market", count=8):
    try:
        result = yf.Search(query, news_count=count)
        if not result or not result.news:
            return []
        articles = []
        for a in result.news[:count]:
            ts = a.get("providerPublishTime", 0)
            date_str = datetime.datetime.fromtimestamp(ts).strftime("%-m/%-d/%Y") if ts else ""
            tickers = a.get("relatedTickers", [])
            articles.append({
                "title": a.get("title", "No Title"),
                "link": a.get("link", "#"),
                "image": a.get("thumbnail", {}).get("resolutions", [{}])[0].get("url", ""),
                "publisher": a.get("publisher", ""),
                "date": date_str,
                "tickers": ",".join(tickers[:6]) if tickers else "",
            })
        return articles
    except Exception as e:
        print(f"News Error: {e}")
        return []

def get_latest_financial_news(count=5):
    try:
        result = yf.Search("Financial Market", news_count=count)
        if not result or not result.news:
            return []
        return [{"title": a.get("title", "No Title"), "link": a.get("link", "#")}
                for a in result.news[:count]]
    except Exception as e:
        print(f"Ticker News Error: {e}")
        return []

# ─── Dash: Home Tabs ────────────────────────────────────────────────────────

appHome = Dash(__name__, server=server, routes_pathname_prefix="/home/")
appHome.layout = html.Div([
    dcc.Location(id="url", refresh=False),
    html.Div(id="tabs-container"),
    html.Div(id="tabs-content")
])

@appHome.callback(Output("tabs-container", "children"), Input("url", "search"))
def update_tabs(search):
    dark_mode = False
    if search:
        query = parse_qs(search.lstrip("?"))
        dark_mode = query.get("darkmode", ["false"])[0] == "true"
    tab_bg = "#222325" if dark_mode else "#f0ede7"
    tab_text = "#dee4fc" if dark_mode else "#311f6b"
    tab_sel_bg = "#dee4fc" if dark_mode else "#311f6b"
    tab_sel_text = "#141417" if dark_mode else "#f0ede7"
    border = "#191a1b" if dark_mode else "#f0ede9"
    style = {"backgroundColor": tab_bg, "color": tab_text, "border": f"1px solid {border}",
             "fontFamily": "Cambria, Georgia, serif", "padding": "10px",
             "textAlign": "center", "justifyContent": "center", "alignItems": "center", "display": "flex"}
    sel_style = {**style, "backgroundColor": tab_sel_bg, "color": tab_sel_text}
    return dcc.Tabs(id="tabs", value="S&P 500",
                    children=[dcc.Tab(label=n, value=n, style=style, selected_style=sel_style)
                              for n in home_tickers],
                    style={"backgroundColor": tab_bg, "borderBottom": f"2px solid {border}",
                           "fontFamily": "Cambria, Georgia, serif"})

@appHome.callback(Output("tabs-content", "children"), Input("tabs", "value"), Input("url", "search"))
def update_home_graph(selected_tab, search):
    colorblind_mode = False
    dark_mode = False
    time_range = "1d"
    if search:
        query = parse_qs(search.lstrip("?"))
        time_range = query.get("time", ["1d"])[0]
        colorblind_mode = query.get("colorblind", ["false"])[0] == "true"
        dark_mode = query.get("darkmode", ["false"])[0] == "true"
    df = fetch_stock_data(home_tickers[selected_tab], time_range)
    line_color, title = determine_color(home_tickers[selected_tab], colorblind_mode)
    bg = "#141417" if dark_mode else "#F9F5ED"
    text = "#dee4fc" if dark_mode else "#311f6b"
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=df.index, y=df["Close"], mode="lines",
                             line=dict(color=line_color, width=2), name=selected_tab))
    fig.update_layout(plot_bgcolor=bg, paper_bgcolor=bg, font=dict(color=text),
                      title=title, title_x=0.5, xaxis_title="Time", yaxis_title="Closing Price",
                      xaxis=dict(showgrid=True), yaxis=dict(showgrid=True))
    return dcc.Graph(figure=fig)

# ─── Dash: Stock Chart ───────────────────────────────────────────────────────

app = Dash(__name__, server=server, routes_pathname_prefix="/dashboard/")
app.layout = html.Div([
    dcc.Location(id="url", refresh=False),
    dcc.Graph(id="live-stock-graph"),
    dcc.Interval(id="interval-component", interval=1000, n_intervals=0),
])

@app.callback(Output("live-stock-graph", "figure"),
              [Input("interval-component", "n_intervals"), Input("url", "search")])
def update_stock_graph(n, search):
    stock_symbol = "^GSPC"
    time_range = "1d"
    colorblind_mode = False
    dark_mode = False
    if search:
        query = parse_qs(search.lstrip("?"))
        stock_symbol = query.get("stock", ["^GSPC"])[0]
        time_range = query.get("time", ["1d"])[0]
        colorblind_mode = query.get("colorblind", ["false"])[0] == "true"
        dark_mode = query.get("darkmode", ["false"])[0] == "true"
    data = fetch_stock_data(stock_symbol, time_range)
    stock = yf.Ticker(stock_symbol)
    stock_info = stock.info
    if data.empty or "currentPrice" not in stock_info:
        return go.Figure()
    current_price = stock_info.get("currentPrice", data["Close"].iloc[-1])
    prev_close = stock_info.get("previousClose", data["Close"].iloc[0])
    price_change = current_price - prev_close
    percent_change = (price_change / prev_close) * 100
    if colorblind_mode:
        line_color = "blue" if price_change > 0 else "orange"
    else:
        line_color = "green" if price_change > 0 else "red"
    sign = "+" if price_change > 0 else ""
    title = f"""
    {stock_info.get('shortName', stock_symbol)} <br>
    ${current_price:.2f} <span style='color:{line_color};'> <br>
    {sign}${price_change:.2f} ({sign}{percent_change:.2f}%) Today</span>
    """
    bg = "#141417" if dark_mode else "#F9F5ED"
    text = "#dee4fc" if dark_mode else "#311f6b"
    figure = go.Figure(data=[go.Scatter(x=data.index, y=data["Close"], mode="lines",
                                        line=dict(color=line_color, width=2), name=stock_symbol)])
    figure.update_layout(plot_bgcolor=bg, paper_bgcolor=bg, font=dict(color=text),
                         title=title, title_x=0.5, xaxis_title="Time", yaxis_title="Price",
                         xaxis=dict(showgrid=True), yaxis=dict(showgrid=True))
    return figure

# ─── Auth Routes ─────────────────────────────────────────────────────────────

@server.route('/login', methods=['GET'])
def login():
    if 'user_id' in session:
        return redirect(url_for('home'))
    return render_template('login.html')

@server.route('/demo-login')
def demo_login():
    user = get_or_create_demo_human_account()
    session['user_id'] = user['id']
    session['user_email'] = user['email']
    return redirect(url_for('portfolio'))

@server.route('/api/auth/challenge', methods=['POST'])
def auth_challenge():
    challenge = os.urandom(32).hex()
    timestamp = current_timestamp_ms()
    session['auth_challenge'] = {
        'challenge': challenge,
        'timestamp': timestamp,
    }
    return jsonify({'challenge': challenge, 'timestamp': timestamp})

@server.route('/api/register', methods=['POST'])
def register():
    data = request.json or {}
    email = (data.get('email') or '').strip().lower()
    pub_key = (data.get('pub_key') or '').strip()
    proof = data.get('proof') or {}
    name = (data.get('name') or '').strip()

    if not email or not pub_key or not proof.get('r') or not proof.get('s'):
        return jsonify({'error': 'Missing required fields'}), 400

    challenge, timestamp, challenge_error = consume_auth_challenge(data)
    if challenge_error:
        return jsonify({'error': challenge_error}), 400

    verified = verify_zk_proof(pub_key, proof['r'], proof['s'], challenge, timestamp)
    if not verified:
        record_auth_event('register', email, pub_key, proof, challenge, timestamp, False, False)
        return jsonify({'error': 'Invalid cryptographic proof'}), 401

    db = get_db()
    existing = db.execute('SELECT id FROM users WHERE email = ? OR pub_key = ?',
                          (email, pub_key)).fetchone()
    if existing:
        db.close()
        return jsonify({'error': 'Account already exists. Please log in.'}), 409

    db.execute('INSERT INTO users (email, pub_key, name, balance) VALUES (?, ?, ?, 10000.00)',
               (email, pub_key, name or email.split('@')[0]))
    db.commit()
    user = db.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
    db.close()

    session['user_id'] = user['id']
    session['user_email'] = user['email']
    record_auth_event('register', user['email'], pub_key, proof, challenge, timestamp, True, True)
    return jsonify({'success': True, 'user': {'email': user['email'], 'name': user['name'],
                                               'balance': user['balance']}})

@server.route('/api/login', methods=['POST'])
def api_login():
    data = request.json or {}
    pub_key = (data.get('pub_key') or '').strip()
    proof = data.get('proof') or {}

    if not pub_key or not proof.get('r') or not proof.get('s'):
        return jsonify({'error': 'Missing credentials'}), 400

    challenge, timestamp, challenge_error = consume_auth_challenge(data)
    if challenge_error:
        return jsonify({'error': challenge_error}), 400

    verified = verify_zk_proof(pub_key, proof['r'], proof['s'], challenge, timestamp)
    if not verified:
        record_auth_event('login', 'unknown', pub_key, proof, challenge, timestamp, False, False)
        return jsonify({'error': 'Invalid cryptographic proof'}), 401

    db = get_db()
    user = db.execute('SELECT * FROM users WHERE pub_key = ?', (pub_key,)).fetchone()
    db.close()

    if not user:
        return jsonify({'error': 'No account found. Please register first.'}), 404

    session['user_id'] = user['id']
    session['user_email'] = user['email']
    record_auth_event('login', user['email'], pub_key, proof, challenge, timestamp, True, True)
    return jsonify({'success': True, 'user': {'email': user['email'], 'name': user['name'],
                                               'balance': user['balance']}})

@server.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('home'))

# ─── Portfolio Routes ─────────────────────────────────────────────────────────

@server.route('/portfolio')
@login_required
def portfolio():
    current_user = get_current_user()
    db = get_db()
    holdings_raw = db.execute('SELECT * FROM portfolio WHERE user_id = ? AND shares > 0',
                              (current_user['id'],)).fetchall()
    recent_trades = db.execute(
        'SELECT * FROM trades WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
        (current_user['id'],)).fetchall()
    latest_ai_decision = db.execute(
        '''
        SELECT *
        FROM trades
        WHERE user_id = ? AND ai_model IS NOT NULL
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        ''',
        (current_user['id'],)
    ).fetchone()
    db.close()

    holdings = []
    total_market_value = 0.0
    for h in holdings_raw:
        try:
            info = yf.Ticker(h['ticker']).info
            price = info.get('currentPrice') or info.get('regularMarketPrice') or h['avg_price']
            market_value = h['shares'] * price
            pnl = market_value - (h['shares'] * h['avg_price'])
            pnl_pct = (pnl / (h['shares'] * h['avg_price'])) * 100 if h['avg_price'] else 0
            holdings.append({'ticker': h['ticker'], 'shares': h['shares'],
                             'avg_price': h['avg_price'], 'current_price': price,
                             'market_value': market_value, 'pnl': pnl, 'pnl_pct': pnl_pct})
            total_market_value += market_value
        except Exception:
            holdings.append({'ticker': h['ticker'], 'shares': h['shares'],
                             'avg_price': h['avg_price'], 'current_price': h['avg_price'],
                             'market_value': h['shares'] * h['avg_price'], 'pnl': 0, 'pnl_pct': 0})

    total_pnl = sum(h['pnl'] for h in holdings)
    return render_template('portfolio.html', current_user=current_user, holdings=holdings,
                           recent_trades=[dict(t) for t in recent_trades],
                           latest_ai_decision=dict(latest_ai_decision) if latest_ai_decision else None,
                           total_market_value=total_market_value,
                           total_value=current_user['balance'] + total_market_value,
                           total_pnl=total_pnl)

# ─── Trading API ─────────────────────────────────────────────────────────────

@server.route('/api/buy', methods=['POST'])
def buy_stock():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    data = request.json or {}
    ticker = (data.get('ticker') or '').upper().strip()
    try:
        shares = float(data.get('shares', 0))
    except (ValueError, TypeError):
        return jsonify({'error': 'Invalid share quantity'}), 400

    try:
        trade = execute_paper_buy(session['user_id'], ticker, shares)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception:
        return jsonify({'error': 'Invalid ticker symbol'}), 400

    return jsonify({'success': True,
                    'message': f'Bought {trade["shares"]} share(s) of {trade["ticker"]} at ${trade["price"]:.2f}',
                    'new_balance': trade['new_balance']})

@server.route('/api/agent/run', methods=['POST'])
@login_required
def run_agent_trade():
    data = request.json or {}
    ticker = (data.get('ticker') or 'AAPL').upper().strip()
    try:
        shares = float(data.get('shares', 2))
    except (ValueError, TypeError):
        return jsonify({'error': 'Invalid share quantity'}), 400

    agent = get_or_create_demo_agent_account()
    try:
        trade = execute_paper_buy(agent['id'], ticker, shares)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception:
        return jsonify({'error': 'Agent could not retrieve a valid stock price'}), 400

    return jsonify({
        'success': True,
        'message': f'AI agent bought {trade["shares"]} share(s) of {trade["ticker"]} at ${trade["price"]:.2f}.',
        'agent': {
            'id': agent['id'],
            'email': agent['email'],
            'name': agent['name'],
        },
        'trade': trade,
        'portfolio_url': url_for('login_demo_agent', user_id=agent['id']),
        'latest_url': url_for('latest_agent_trade'),
    })

@server.route('/api/agent/create-account', methods=['POST'])
def create_agent_account_api():
    agent = create_demo_agent_account()
    return jsonify({
        'success': True,
        'message': f'Created fake AI stock account {agent["email"]}.',
        'agent': {
            'id': agent['id'],
            'email': agent['email'],
            'name': agent['name'],
            'balance': agent['balance'],
        },
        'portfolio_url': url_for('login_demo_agent', user_id=agent['id']),
    })

@server.route('/api/agent/trade', methods=['POST'])
def agent_trade_api():
    data = request.json or {}
    try:
        agent_id = int(data.get('agent_id'))
        shares = float(data.get('shares', 2))
    except (ValueError, TypeError):
        return jsonify({'error': 'Invalid agent or share quantity'}), 400

    ticker = (data.get('ticker') or 'AAPL').upper().strip()
    db = get_db()
    agent = db.execute('SELECT * FROM users WHERE id = ? AND email LIKE ?', (agent_id, '%@zync.ai')).fetchone()
    db.close()
    if not agent:
        return jsonify({'error': 'Agent account not found'}), 404

    try:
        trade = execute_paper_buy(agent['id'], ticker, shares)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception:
        return jsonify({'error': 'Agent could not retrieve a valid stock price'}), 400

    return jsonify({
        'success': True,
        'message': f'Bought {trade["shares"]} share(s) of {trade["ticker"]} at ${trade["price"]:.2f}.',
        'agent': {
            'id': agent['id'],
            'email': agent['email'],
            'name': agent['name'],
        },
        'trade': trade,
        'portfolio_url': url_for('login_demo_agent', user_id=agent['id']),
        'latest_url': url_for('latest_agent_trade'),
    })

@server.route('/api/agent/openai-trade', methods=['POST'])
def agent_openai_trade_api():
    data = request.json or {}
    try:
        agent_id = int(data.get('agent_id'))
    except (ValueError, TypeError):
        return jsonify({'error': 'Invalid agent account'}), 400

    db = get_db()
    agent = db.execute('SELECT * FROM users WHERE id = ? AND email LIKE ?', (agent_id, '%@zync.ai')).fetchone()
    db.close()
    if not agent:
        return jsonify({'error': 'Agent account not found'}), 404
    agent = dict(agent)

    try:
        decision = get_openai_trade_decision(
            agent,
            ticker_hint=data.get('ticker'),
            shares_hint=data.get('shares'),
        )
        trade = execute_paper_buy(
            agent['id'],
            decision['ticker'],
            decision['shares'],
            ai_model=decision['model'],
            ai_reason=decision['reason'],
        )
    except RuntimeError as e:
        return jsonify({'error': str(e)}), 502
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception:
        return jsonify({'error': 'OpenAI agent trade failed.'}), 500

    return jsonify({
        'success': True,
        'message': f'OpenAI chose to buy {trade["shares"]} share(s) of {trade["ticker"]} at ${trade["price"]:.2f}.',
        'agent': {
            'id': agent['id'],
            'email': agent['email'],
            'name': agent['name'],
        },
        'decision': decision,
        'trade': trade,
        'portfolio_url': url_for('login_demo_agent', user_id=agent['id']),
        'latest_url': url_for('latest_agent_trade'),
    })

@server.route('/demo-agent-login/<int:user_id>')
def login_demo_agent(user_id):
    db = get_db()
    user = db.execute('SELECT * FROM users WHERE id = ? AND email LIKE ?', (user_id, '%@zync.ai')).fetchone()
    db.close()
    if not user:
        return redirect(url_for('login'))
    session['user_id'] = user['id']
    session['user_email'] = user['email']
    return redirect(url_for('portfolio'))

@server.route('/api/sell', methods=['POST'])
def sell_stock():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    data = request.json or {}
    ticker = (data.get('ticker') or '').upper().strip()
    try:
        shares = float(data.get('shares', 0))
    except (ValueError, TypeError):
        return jsonify({'error': 'Invalid share quantity'}), 400

    if not ticker or shares <= 0:
        return jsonify({'error': 'Invalid ticker or share quantity'}), 400

    user_id = session['user_id']
    db = get_db()
    holding = db.execute('SELECT shares FROM portfolio WHERE user_id = ? AND ticker = ?',
                         (user_id, ticker)).fetchone()
    if not holding or holding['shares'] < shares:
        db.close()
        return jsonify({'error': f'Insufficient shares. You own {holding["shares"] if holding else 0:.4f}'}), 400

    try:
        info = yf.Ticker(ticker).info
        price = info.get('currentPrice') or info.get('regularMarketPrice')
        if not price:
            db.close()
            return jsonify({'error': 'Could not retrieve current price'}), 400
    except Exception:
        db.close()
        return jsonify({'error': 'Invalid ticker symbol'}), 400

    proceeds = round(shares * price, 4)
    new_shares = holding['shares'] - shares

    if new_shares < 0.0001:
        db.execute('DELETE FROM portfolio WHERE user_id = ? AND ticker = ?', (user_id, ticker))
    else:
        db.execute('UPDATE portfolio SET shares = ? WHERE user_id = ? AND ticker = ?',
                   (new_shares, user_id, ticker))

    db.execute('UPDATE users SET balance = balance + ? WHERE id = ?', (proceeds, user_id))
    db.execute('INSERT INTO trades (user_id, ticker, action, shares, price, total) VALUES (?,?,?,?,?,?)',
               (user_id, ticker, 'sell', shares, price, proceeds))
    db.commit()
    new_balance = db.execute('SELECT balance FROM users WHERE id = ?', (user_id,)).fetchone()['balance']
    db.close()

    return jsonify({'success': True,
                    'message': f'Sold {shares} share(s) of {ticker} at ${price:.2f}',
                    'new_balance': new_balance})

@server.route('/api/price/<ticker>')
def get_price(ticker):
    try:
        info = yf.Ticker(ticker.upper()).info
        price = info.get('currentPrice') or info.get('regularMarketPrice')
        if not price:
            return jsonify({'error': 'Price unavailable'}), 404
        return jsonify({'price': price, 'name': info.get('shortName', ticker.upper())})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@server.route('/api/position/<ticker>')
def get_position(ticker):
    if 'user_id' not in session:
        return jsonify({'shares': 0, 'avg_price': 0})
    db = get_db()
    holding = db.execute('SELECT shares, avg_price FROM portfolio WHERE user_id = ? AND ticker = ?',
                         (session['user_id'], ticker.upper())).fetchone()
    balance = db.execute('SELECT balance FROM users WHERE id = ?', (session['user_id'],)).fetchone()
    db.close()
    return jsonify({'shares': holding['shares'] if holding else 0,
                    'avg_price': holding['avg_price'] if holding else 0,
                    'balance': balance['balance'] if balance else 0})

@server.route('/latest-agent-trade')
def latest_agent_trade():
    db = get_db()
    trade = db.execute('''
        SELECT
            trades.*,
            users.email,
            users.name,
            users.balance
        FROM trades
        JOIN users ON users.id = trades.user_id
        WHERE users.email LIKE '%@zync.ai'
        ORDER BY trades.created_at DESC, trades.id DESC
        LIMIT 1
    ''').fetchone()

    holdings = []
    if trade:
        holdings = db.execute('''
            SELECT ticker, shares, avg_price
            FROM portfolio
            WHERE user_id = ? AND shares > 0
            ORDER BY ticker
        ''', (trade['user_id'],)).fetchall()
    db.close()

    return render_template('latest_agent_trade.html',
                           current_user=get_current_user(),
                           trade=dict(trade) if trade else None,
                           holdings=[dict(h) for h in holdings])

@server.route('/auth-demo-status')
def auth_demo_status():
    return render_template('auth_demo_status.html',
                           current_user=get_current_user(),
                           event=latest_auth_event)

@server.route('/agent-demo')
def agent_demo():
    return render_template('agent_demo.html', current_user=get_current_user())

# ─── Flask Page Routes ────────────────────────────────────────────────────────

def _build_article_url(a):
    return "/article?" + urlencode({
        "title": a["title"], "link": a["link"], "image": a["image"],
        "publisher": a["publisher"], "date": a["date"], "tickers": a.get("tickers", ""),
    })

def _get_ticker_cards(tickers_str):
    if not tickers_str:
        return []
    cards = []
    for sym in tickers_str.split(","):
        sym = sym.strip()
        if not sym:
            continue
        try:
            t = yf.Ticker(sym)
            fi = t.fast_info
            price = fi.last_price
            prev = fi.previous_close
            change = round((price - prev) / prev * 100, 2) if prev else 0
            name = t.info.get("shortName", sym)
            cards.append({"ticker": sym, "name": name, "price": round(price, 2), "change": change})
        except Exception:
            cards.append({"ticker": sym, "name": sym, "price": "N/A", "change": "N/A"})
    return cards

@server.route("/", methods=["GET"])
def home():
    current_user = get_current_user()
    raw_news = get_main_news(query="Stock Market", count=8)
    home_news = [{**a, "article_url": _build_article_url(a)} for a in raw_news]
    trending_stocks = get_trending_stocks()
    return render_template("home.html", home_news=home_news, trending_stocks=trending_stocks,
                           current_user=current_user)

@server.route("/article", methods=["GET"])
def article():
    current_user = get_current_user()
    title = request.args.get("title", "")
    link = request.args.get("link", "#")
    image = request.args.get("image", "")
    publisher = request.args.get("publisher", "")
    date = request.args.get("date", "")
    tickers_str = request.args.get("tickers", "")
    related_stocks = _get_ticker_cards(tickers_str)
    related_news = get_main_news(query="Stock Market", count=5)
    related = []
    for a in related_news:
        if a["link"] != link:
            related.append({**a, "article_url": _build_article_url(a)})
    return render_template("article.html", title=title, link=link, image=image,
                           publisher=publisher, date=date, related=related[:3],
                           related_stocks=related_stocks, current_user=current_user)

@server.route("/api/fetch_article")
def fetch_article_api():
    url = request.args.get("url", "")
    if not url:
        return jsonify({"error": "No URL", "summary": "", "paragraphs": []})
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }
        resp = requests.get(url, headers=headers, timeout=12, allow_redirects=True)
        soup = BeautifulSoup(resp.text, "html.parser")

        summary = ""
        for attr, val in [("property", "og:description"), ("name", "description"), ("name", "twitter:description")]:
            meta = soup.find("meta", attrs={attr: val})
            if meta and meta.get("content"):
                summary = meta["content"].strip()
                break

        skip_phrases = ["cookie", "subscribe", "sign up", "newsletter", "advertisement",
                        "sign in", "log in", "already a member", "privacy policy"]

        container = (
            soup.find("article") or
            soup.find(attrs={"itemprop": "articleBody"}) or
            soup.find(class_=re.compile(r"article[_-]?body|story[_-]?body|post[_-]?content|entry[_-]?content|caas-body", re.I)) or
            soup.find("main")
        )

        paragraphs = []
        source = container if container else soup
        for p in source.find_all("p"):
            text = p.get_text(strip=True)
            if len(text) > 60 and not any(s in text.lower() for s in skip_phrases):
                paragraphs.append(text)
            if len(paragraphs) >= 15:
                break

        return jsonify({"summary": summary, "paragraphs": paragraphs})
    except Exception as e:
        return jsonify({"error": str(e), "summary": "", "paragraphs": []})

@server.route('/news.html', methods=["GET", "POST"])
def news():
    if request.method == "POST":
        query = request.form.get("query", "Stock Market")
    else:
        query = request.args.get("query", "Stock Market")
    news_articles = get_news(query, count=8)
    current_user = get_current_user()
    return render_template("news.html", news=news_articles, current_user=current_user)

@server.route('/load_more_news', methods=["GET"])
def load_more_news():
    query = request.args.get("query", "Stock Market")
    offset = int(request.args.get("offset", 0))
    return jsonify(get_news(query, count=8, offset=offset))

@server.route('/stock', methods=["GET", "POST"])
def stock():
    stock_symbol = request.args.get("stock", "^GSPC").upper()
    current_user = get_current_user()
    stock_news = get_stock_news(stock_symbol, count=5)
    ticker_news = get_latest_financial_news()
    stock_overview = get_stock_overview(stock_symbol)
    stock_about = get_stock_about(stock_symbol)
    trending_stocks = get_trending_stocks()
    related_stocks = get_related_stocks(stock_symbol)

    user_position = None
    if current_user:
        db = get_db()
        pos = db.execute('SELECT shares, avg_price FROM portfolio WHERE user_id = ? AND ticker = ?',
                         (current_user['id'], stock_symbol)).fetchone()
        db.close()
        if pos and pos['shares'] > 0:
            user_position = dict(pos)

    return render_template("stock.html", stock_symbol=stock_symbol, stock_overview=stock_overview,
                           stock_about=stock_about, trending_stocks=trending_stocks,
                           related_stocks=related_stocks, stock_news=stock_news,
                           ticker_news=ticker_news, current_user=current_user,
                           user_position=user_position)

@server.route('/autocomplete_stock', methods=["GET"])
def autocomplete_stock():
    query = request.args.get("query", "").lower()
    if not query:
        return jsonify([])
    try:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        resp = requests.get(f"https://query1.finance.yahoo.com/v1/finance/search?q={query}", headers=headers)
        if resp.status_code == 200:
            return jsonify([{"name": s.get("shortname", s.get("symbol")), "symbol": s.get("symbol")}
                            for s in resp.json().get("quotes", [])[:10]
                            if s.get("shortname") and s.get("symbol")])
    except Exception as e:
        print(f"Autocomplete error: {e}")
    return jsonify([])

if __name__ == "__main__":
    server.run(debug=True, port=5000)
