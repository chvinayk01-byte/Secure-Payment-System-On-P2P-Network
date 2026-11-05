
import { useState, useEffect, useRef } from "react";
import { apiRequest } from "./services/api";
import "./App.css";

function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");

  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("user")) || null;
    } catch {
      return null;
    }
  });

  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [balance, setBalance] = useState("0.00");
  const [transactions, setTransactions] = useState([]);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  const [message, setMessage] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [receiverEmail, setReceiverEmail] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferMessage, setTransferMessage] = useState("");
  const [transferError, setTransferError] = useState("");

  const [selectedTransaction, setSelectedTransaction] = useState(null);

  // Transaction search and filter
  const [searchTerm, setSearchTerm] = useState("");
  const [transactionFilter, setTransactionFilter] = useState("ALL");

  const pendingIdempotencyKey = useRef(null);

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    setToken("");
    setUser(null);
    setBalance("0.00");
    setTransactions([]);
    setMessage("");
    setTransferMessage("");
    setTransferError("");
    setSelectedTransaction(null);
    setSearchTerm("");
    setTransactionFilter("ALL");
    pendingIdempotencyKey.current = null;
  }

  async function loadDashboard(authToken) {
    setDashboardLoading(true);

    try {
      const [walletData, transactionData] = await Promise.all([
        apiRequest("/wallet", { token: authToken }),
        apiRequest("/transactions", { token: authToken }),
      ]);

      setBalance(walletData.balance);
      setTransactions(transactionData.transactions || []);
    } catch (error) {
      const errorText = error.message.toLowerCase();

      if (
        errorText.includes("token") ||
        errorText.includes("unauthorized") ||
        errorText.includes("jwt") ||
        errorText.includes("authorization")
      ) {
        logout();
        setMessage("Your session has expired. Please log in again.");
      } else {
        setMessage(error.message);
      }
    } finally {
      setDashboardLoading(false);
    }
  }

  useEffect(() => {
    if (token && user) {
      loadDashboard(token);
    }
    // Restore dashboard data when the saved session is loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAuth(e) {
    e.preventDefault();
    setMessage("");

    try {
      setAuthLoading(true);

      const endpoint = isRegister ? "/auth/register" : "/auth/login";

      const body = isRegister
        ? { name: name.trim(), email: email.trim(), password }
        : { email: email.trim(), password };

      const data = await apiRequest(endpoint, {
        method: "POST",
        body: JSON.stringify(body),
      });

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      setToken(data.token);
      setUser(data.user);
      setPassword("");
      setMessage(
        isRegister
          ? "Registration successful!"
          : `Welcome, ${data.user.name}! Login successful.`
      );

      await loadDashboard(data.token);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleTransfer(e) {
    e.preventDefault();

    setTransferMessage("");
    setTransferError("");

    if (!receiverEmail.trim() || !transferAmount.trim()) {
      setTransferError("Please enter receiver email and amount.");
      return;
    }

    try {
      setTransferLoading(true);

      if (!pendingIdempotencyKey.current) {
        pendingIdempotencyKey.current = crypto.randomUUID();
      }

      const result = await apiRequest("/wallet/transfer", {
        method: "POST",
        token,
        body: JSON.stringify({
          receiverEmail: receiverEmail.trim(),
          amount: transferAmount.trim(),
          idempotencyKey: pendingIdempotencyKey.current,
        }),
      });

      setTransferMessage(
        `Transfer successful! ₹${result.amount} sent. Reference: ${result.reference}`
      );

      setReceiverEmail("");
      setTransferAmount("");
      pendingIdempotencyKey.current = null;

      await loadDashboard(token);
    } catch (error) {
      setTransferError(error.message);
    } finally {
      setTransferLoading(false);
    }
  }

  function toggleTransaction(transaction) {
    setSelectedTransaction((current) =>
      current?.reference === transaction.reference ? null : transaction
    );
  }

  const filteredTransactions = transactions.filter((transaction) => {
    const isOutgoing = transaction.direction === "OUTGOING";

    const matchesFilter =
      transactionFilter === "ALL" ||
      (transactionFilter === "SENT" && isOutgoing) ||
      (transactionFilter === "RECEIVED" && !isOutgoing);

    const search = searchTerm.toLowerCase().trim();

    const matchesSearch =
      !search ||
      transaction.reference?.toLowerCase().includes(search) ||
      transaction.sender?.name?.toLowerCase().includes(search) ||
      transaction.sender?.email?.toLowerCase().includes(search) ||
      transaction.receiver?.name?.toLowerCase().includes(search) ||
      transaction.receiver?.email?.toLowerCase().includes(search) ||
      transaction.amount?.toString().includes(search);

    return matchesFilter && matchesSearch;
  });

  if (token && user) {
    return (
      <main className="dashboard">
        <header className="dashboard-header">
          <div>
            <h1>Secure P2P Payment</h1>
            <p>Welcome, {user.name}</p>
          </div>

          <button className="logout-btn" onClick={logout}>
            Logout
          </button>
        </header>

        {message && <p className="message">{message}</p>}

        <section className="balance-card">
          <p>Available Wallet Balance</p>
          <h2>₹{balance}</h2>
          <p>Indian Rupees (INR)</p>

          <button
            type="button"
            onClick={() => loadDashboard(token)}
            disabled={dashboardLoading}
          >
            {dashboardLoading ? "Refreshing..." : "Refresh Balance"}
          </button>
        </section>

        <section className="transfer-card">
          <h2>Send Money</h2>
          <p>Transfer money to another registered user.</p>

          <form onSubmit={handleTransfer}>
            <label htmlFor="receiverEmail">Receiver Email</label>
            <input
              id="receiverEmail"
              type="email"
              placeholder="Enter receiver email"
              value={receiverEmail}
              onChange={(e) => setReceiverEmail(e.target.value)}
              required
            />

            <label htmlFor="transferAmount">Amount (INR)</label>
            <input
              id="transferAmount"
              type="number"
              placeholder="Enter amount"
              value={transferAmount}
              onChange={(e) => setTransferAmount(e.target.value)}
              min="0.01"
              max="100000"
              step="0.01"
              required
            />

            <button type="submit" disabled={transferLoading}>
              {transferLoading ? "Processing..." : "Send Money"}
            </button>
          </form>

          {transferMessage && (
            <p className="transfer-success">{transferMessage}</p>
          )}

          {transferError && (
            <p className="transfer-error">{transferError}</p>
          )}
        </section>

        <section className="transactions-section">
          <div className="transactions-heading">
            <h2>Transaction History</h2>
            <span>{filteredTransactions.length} shown</span>
          </div>

          <input
            className="transaction-search"
            type="search"
            placeholder="Search by name, email or reference..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          <div className="transaction-filters">
            <button
              type="button"
              className={transactionFilter === "ALL" ? "active" : ""}
              onClick={() => setTransactionFilter("ALL")}
            >
              All
            </button>

            <button
              type="button"
              className={transactionFilter === "SENT" ? "active" : ""}
              onClick={() => setTransactionFilter("SENT")}
            >
              Sent
            </button>

            <button
              type="button"
              className={transactionFilter === "RECEIVED" ? "active" : ""}
              onClick={() => setTransactionFilter("RECEIVED")}
            >
              Received
            </button>
          </div>

          {dashboardLoading ? (
            <p>Loading transactions...</p>
          ) : filteredTransactions.length === 0 ? (
            <p className="no-transactions">
              No matching transactions found.
            </p>
          ) : (
            <div className="transaction-list">
              {filteredTransactions.map((transaction) => {
                const isOutgoing =
                  transaction.direction === "OUTGOING";

                const isSelected =
                  selectedTransaction?.reference === transaction.reference;

                return (
                  <article
                    className="transaction-item"
                    key={transaction.reference}
                  >
                    <div className="transaction-main">
                      <div>
                        <strong>
                          {isOutgoing ? "Money Sent" : "Money Received"}
                        </strong>

                        <p>
                          {isOutgoing
                            ? `To: ${transaction.receiver?.name || "User"}`
                            : `From: ${transaction.sender?.name || "User"}`}
                        </p>

                        <small>
                          {new Date(
                            transaction.createdAt
                          ).toLocaleString()}
                        </small>
                      </div>

                      <div>
                        <strong
                          className={
                            isOutgoing
                              ? "amount-outgoing"
                              : "amount-incoming"
                          }
                        >
                          {isOutgoing ? "-" : "+"}₹{transaction.amount}
                        </strong>

                        <button
                          type="button"
                          className="details-btn"
                          onClick={() => toggleTransaction(transaction)}
                        >
                          {isSelected ? "Hide Details" : "View Details"}
                        </button>
                      </div>
                    </div>

                    {isSelected && (
                      <div className="transaction-details">
                        <h3>Transaction Details</h3>

                        <p>
                          <strong>Reference ID:</strong>{" "}
                          {transaction.reference}
                        </p>

                        <p>
                          <strong>Sender:</strong>{" "}
                          {transaction.sender?.name || "Unknown"}
                        </p>

                        <p>
                          <strong>Sender Email:</strong>{" "}
                          {transaction.sender?.email || "Unavailable"}
                        </p>

                        <p>
                          <strong>Receiver:</strong>{" "}
                          {transaction.receiver?.name || "Unknown"}
                        </p>

                        <p>
                          <strong>Receiver Email:</strong>{" "}
                          {transaction.receiver?.email || "Unavailable"}
                        </p>

                        <p>
                          <strong>Amount:</strong> ₹{transaction.amount}{" "}
                          {transaction.currency || "INR"}
                        </p>

                        <p>
                          <strong>Status:</strong> {transaction.status}
                        </p>

                        <p>
                          <strong>Date:</strong>{" "}
                          {new Date(
                            transaction.createdAt
                          ).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="auth-container">
      <section className="auth-card">
        <h1>Secure P2P Payment</h1>
        <p>
          {isRegister
            ? "Create your account and wallet"
            : "Sign in to access your wallet"}
        </p>

        <form onSubmit={handleAuth}>
          {isRegister && (
            <>
              <label htmlFor="name">Full Name</label>
              <input
                id="name"
                type="text"
                placeholder="Enter your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                minLength="2"
                maxLength="60"
                required
              />
            </>
          )}

          <label htmlFor="email">Email Address</label>
          <input
            id="email"
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={isRegister ? 8 : undefined}
            maxLength="72"
            required
          />

          <button type="submit" disabled={authLoading}>
            {authLoading
              ? "Please wait..."
              : isRegister
                ? "Create Account"
                : "Login"}
          </button>
        </form>

        {message && <p className="message">{message}</p>}

        <p className="auth-switch">
          {isRegister
            ? "Already have an account?"
            : "Don't have an account?"}

          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister);
              setMessage("");
            }}
          >
            {isRegister ? "Login" : "Register"}
          </button>
        </p>
      </section>
    </main>
  );
}

export default App;
