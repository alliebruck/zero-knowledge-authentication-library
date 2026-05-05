import datetime
import yfinance as yf
import pandas as pd
from dash import dash, dcc, html, Input, Output, callback
import plotly.graph_objs as go
from dash.dependencies import Input, Output, State
from flask import Flask

server = Flask(__name__)

# Initialize the Dash app
app = dash.Dash(__name__, server=server)

# Defines the layout of the dashboard
app.layout = html.Div([
   html.H1(children="BearWatch",style={'textAlign':'center'}),  # Title of the dashboard
   # Input for stock symbol
   html.Div([
        dcc.Input(id="stock-input", type="text", value="AAPL", placeholder="Enter stock symbol",
                  style={'marginRight': '10px', 'padding': '10px', 'fontSize': '16px'}),
        html.Button("Submit", id="submit-button", n_clicks=0, style={'padding': '10px', 'fontSize': '16px'})
   ], style={'marginBottom': '20px'}),

   dcc.Graph(id="live-stock-graph"),

    # Interval component to update the graph every 5 seconds
   dcc.Interval(id="interval-component", interval=5000, n_intervals=0)
])

@app.callback(
    Output("live-stock-graph", "figure"),
    [Input("interval-component", "n_intervals"), Input("submit-button", "n_clicks")],
    [State("stock-input", "value")]
)
def update_graph(n, n_clicks, stock_symbol):
    if not stock_symbol:
        stock_symbol = "AAPL"  # Default to AAPL if no input
    
    stock = yf.Ticker(stock_symbol)
    data = stock.history(period="1d", interval="1m")  # Fetch recent minute data

    if not data.empty:
        figure = go.Figure(data=[go.Scatter(
            x=data.index,
            y=data["Close"],
            mode="lines+markers",
            name=stock_symbol
        )])
        figure.update_layout(title=f"Real-Time {stock_symbol} Stock Price",
                             xaxis_title="Time",
                             yaxis_title="Price",
                             xaxis=dict(showgrid=True),
                             yaxis=dict(showgrid=True))
        return figure
# Run the app
if __name__ == '__main__':
   server.run(debug=True)

