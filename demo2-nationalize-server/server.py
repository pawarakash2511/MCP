from mcp.server.fastmcp import FastMCP
import requests

#  1 - Initialization
server = FastMCP("Nationalize Service")


# 2 - Tool Definition
@server.tool()
def predict_nationality(name: str) -> dict:
    """
    Predict the nationality of a person based on their name.
    """
    url = f"https://api.nationalize.io/?name={name}"

    response = requests.get(url, timeout=15)
    return response.json()


if __name__ == "__main__":
    server.run()