# Secure Book Fair Stall Reservation System
### Academic Assessment: Secure Web Application Development (Assessment 2)

---

## 1. Project Overview
This project is an enterprise-grade, security-hardened Book Fair Stall Reservation System designed to mitigate OWASP Top 10 vulnerabilities and transition authentication to a modern federated model.

The application follows a decoupled distributed architecture:
* **Frontend**: A Single Page Application (SPA) built using React, Vite, and Tailwind CSS.
* **Backend API**: A Spring Boot REST API backed by Spring Security and Spring Data JPA.
* **Database**: MySQL Server for persistent storage of user profiles, event details, and reservation states.
* **ML Service**: A Python-based FastAPI server providing stall genre recommendation models.

Authentication is entirely offloaded to **Auth0** (acting as the external Identity Provider) using **OpenID Connect (OIDC)** and the **OAuth 2.0 Authorization Code Flow with PKCE (Proof Key for Code Exchange)**. The Spring Boot backend acts as an **OAuth 2.0 Resource Server**, intercepting incoming requests, checking cryptographic signatures against the IdP's JWKS endpoint, and matching OIDC subject keys (`sub`) to local user records using **Just-In-Time (JIT) provisioning**.

Comprehensive access controls, transport security, data validation, and exception handling are enforced across the stack to ensure that authorization remains strictly server-side.

---

## 2. System Architecture
```text
+------------------+             HTTPS (TLS 1.3)            +-----------------------+
|  React SPA client| <====================================> |    Spring Boot API    |
|  localhost:5173  |                                        |    localhost:8443     |
+------------------+                                        +-----------------------+
        |                                                               |
        | OIDC / OAuth 2.0 + PKCE                                       | JDBC / Hibernate JPA
        v                                                               v
+------------------+                                        +-----------------------+
|  Auth0 Tenant    |                                        |    MySQL Database     |
|Identity Provider |                                        |    localhost:3306     |
+------------------+                                        +-----------------------+
                                                                        |
                                                                        v HTTP (Internal REST)
                                                            +-----------------------+
                                                            |      FastAPI ML       |
                                                            |   Recommendation Svc  |
                                                            +-----------------------+
```

### Technology Stack & Component Specifications

#### Frontend (SPA Client)
* **React 18**: Component-based UI rendering with state hooks and context providers.
* **Vite**: Ultra-fast build tool and development server configured to run native TLS/HTTPS.
* **Tailwind CSS**: Utility-first CSS styling framework.
* **Web Crypto API**: Used natively in custom JS to execute cryptographic SHA-256 hashing and base64url encoding for PKCE.

#### Backend (Resource Server API)
* **Java 17 & Spring Boot 3.3.2**: Core framework for business logic and REST endpoints.
* **Spring Security 6.3**: Enforces stateless request authorization, filter chain configurations, and method-level access rules.
* **Spring OAuth2 Resource Server**: Decodes JWT access tokens and maps signature keys dynamically using remote JWK Sets.
* **Spring Data JPA & Hibernate 6**: Object-Relational Mapping (ORM) to interface with the MySQL database.
* **Jakarta Bean Validation 3.0**: Triggers validation constraints on request bodies.
* **Spring WebSocket & STOMP**: Handles real-time messaging for interactive stall updates.

#### Relational Database
* **MySQL 8.0**: Structured schema persistence, mapping relationships, and executing transaction-isolated writes.

#### ML Recommendation Service
* **FastAPI**: Lightweight, asynchronous web framework for hosting machine learning inference models.
* **Scikit-Learn**: Machine learning utility framework containing clustering/prediction pipelines.

---

## 3. User Roles & Privileges
Access authorization in the application is strictly partitioned into two primary roles, aligning with the principle of least privilege.

### STALL_VENDOR
Stall vendors represent commercial exhibitors registering to reserve venue space. A vendor is authorized to:
* Authenticate dynamically via the cloud OIDC redirect flow.
* View and edit their vendor profile (contact numbers, business name).
* Request stall reservations for active book fair events.
* View the list of reservations belonging *exclusively* to their own account.
* Cancel reservations, provided the request occurs prior to the event's cancellation deadline.

*Access Restriction*: Stall vendors are completely locked out of administrative REST routes and WebSocket topics. The application enforces server-side ownership validations preventing Vendor A from viewing or modifying Vendor B's reservation records, even if they guess or brute-force the booking IDs.

### EXHIBITION_ORGANIZER
Exhibition organizers represent system administrators managing the book fair logistics. An organizer is authorized to:
* View administrative analytics (KPI metrics, total revenue collected, reservation distributions, genre performance).
* Create, update, or deactivate book fair events and their associated layouts.
* Add or block specific stalls.
* View *all* reservation requests across *all* vendors.
* Process approvals, rejections, and trigger payment refunds.
* Deactivate vendor accounts.

*Access Restriction*: Administrative functions require the backend context to contain the `ROLE_ADMIN` authority. Any request lacking this authority is immediately blocked with a `403 Forbidden` response.

---

## 4. Authentication and Authorization

### OIDC Authorization Code Flow with PKCE
Public clients (like React SPAs running in browser runtimes) cannot protect secret keys. To prevent authorization code interception attacks, the system utilizes the **Authorization Code Flow with PKCE (RFC 7636)**:

```text
React Client                                                  Auth0 Server
    |                                                              |
    |---- 1. Generate Verifier & Challenge (SHA-256) ------------->|
    |---- 2. Redirect User to /authorize?challenge=...------------>|
    |                                                              | (User authenticates)
    |<--- 3. Redirect back to /callback?code=AUTH_CODE ------------|
    |                                                              |
    |---- 4. POST /oauth/token (code + code_verifier) ------------>|
    |<--- 5. Return Access Token & ID Token -----------------------|
```

1. **Challenge Generation**: The frontend generates a cryptographically random string (`code_verifier`) and calculates its SHA-256 hash, encoding the digest into a URL-safe base64 string (`code_challenge`).
2. **Authorization Request**: The frontend redirects the user's browser to the Auth0 `/authorize` endpoint, passing the `code_challenge` and `code_challenge_method=S256` parameters.
3. **User Authentication**: Auth0 authenticates the user and obtains consent.
4. **Authorization Code**: Auth0 redirects the browser back to the React app's `/callback` URL with a temporary `code` parameter.
5. **Token Exchange**: The frontend sends a POST request directly to the Auth0 `/oauth/token` endpoint containing the `code` and the raw `code_verifier`. Auth0 hashes the verifier and validates it against the initial challenge. If they match, Auth0 releases the Access and ID tokens.
6. **API Consumption**: The React application stores the Access Token in memory and attaches it as a Bearer token in the `Authorization` header of all subsequent API requests.

### Backend JWT Validation and JIT Provisioning
The Spring Boot backend operates as a stateless resource server. Its filter chain interceptor executes the following validations:
1. **Extraction**: Reads the JWT from the `Authorization: Bearer <token>` header.
2. **Signature Validation**: Resolves the token's signature using the public signing keys fetched dynamically from the configured `jwk-set-uri`.
3. **Claims Verification**: Validates the issuer (`iss`), audience (`aud`), and expiration time (`exp`).
4. **JIT User Mapping**:
   * Reads the `email` claim from the validated token.
   * Checks the local MySQL database for a matching user record.
   * If the user does not exist, the filter **JIT-provisions** a new database entry.
   * If the email matches the configured admin whitelist (`app.oidc.admin-emails`), the user is provisioned as an `EXHIBITION_ORGANIZER` (`UserRole.ADMIN`). Otherwise, they are provisioned as a `STALL_VENDOR` (`UserRole.VENDOR`).
5. **Context Binding**: Maps the user's local database ID and roles into a Spring Security `UsernamePasswordAuthenticationToken` authority context. This makes the local database ID available across all REST service layers via `auth.getPrincipal()`, eliminating client-side ID manipulation.

---

## 5. Security Controls and OWASP Mitigations

### A01:2021 – Broken Access Control
* **Method Security**: All administrative REST mappings in `ReservationController` are secured using `@PreAuthorize("hasAuthority('ROLE_ADMIN')")` or `@PreAuthorize("hasRole('ADMIN')")`.
* **Indirect Object Reference (IDOR) Protection**: In `ReservationController.java`'s `getDetail` endpoint, the service checks the principal. If the authenticated user is a Vendor, the system queries the reservation and ensures `reservation.vendor.id` exactly matches the authenticated user ID. Unauthorized access attempts yield a `403 Forbidden` response instead of exposing data.

### A02:2021 – Cryptographic Failures
* **TLS 1.3 Transport Encryption**: HTTP has been completely disabled. Both Vite and Tomcat are configured with self-signed SSL certificates, forcing all data-in-transit (session tokens, profiles, payments) to be encrypted via HTTPS.
* **Secrets Management**: Configuration credentials (database passwords, mail credentials, OIDC secrets, and keystore parameters) are loaded at runtime using environment variables (`${DB_PASSWORD}`, `${SSL_KEYSTORE_PASSWORD}`). No plain-text secrets are committed to the codebase.

### A03:2021 – Injection
* **Parameterized Queries**: All database queries are handled through Spring Data JPA interfaces. JPQL and native queries utilize parameterized binding (`:eventId`, `:vendorId`) which ensures Hibernate pre-compiles queries and prevents SQL Injection.
* **Input Sanitization**: Request payloads are passed through validation DTOs enforcing limits on string length, special characters, and data ranges.

### A04:2021 – Insecure Design
* **Business Logic Safeguards**: Added strict date validation constraints inside `CreateBookingRequest` and `ReservationServiceImpl.java`. The system checks if `reservationDate` is before the current system date and throws an `IllegalArgumentException` on invalid dates.

### A05:2021 – Security Misconfiguration
* **Exception Interception**: The `GlobalExceptionHandler` interceptor was expanded to catch the base `Exception.class` type. This prevents database stack traces, SQL errors, or compiler exceptions from leaking to client responses. Unhandled exceptions instead return a generic message: `"An unexpected error occurred. Please contact the administrator."`
* **Secure HTTP Headers**: Enforces HSTS, Content-Security-Policy (CSP), `X-Frame-Options: DENY`, and `X-Content-Type-Options: nosniff`.
* **Restricted CORS**: The API explicitly allowlists the client origins. Star (`*`) wildcards are rejected.

### A07:2021 – Identification and Authentication Failures
* **Federated Auth**: Local credential checks are completely removed in OIDC mode. Passwords are no longer stored or verified by the database, eliminating threats like brute-forcing, credential stuffing, and session hijacking.
* **Stateless Token Validation**: Sessions are fully stateless. Session IDs are not stored on the server, eliminating session fixation and session hijacking risks.

### A09:2021 – Security Logging & Monitoring Failures
* **Audit Logging**: Added clear logger messages inside the authentication filter chain. The system logs JIT-provisioning occurrences, token validation checks, and authorization context bindings.

---

## 6. OWASP Security Audit (Before vs. After Fixes)

An independent security verification was executed against the platform. Below are the audited vulnerability states before and after implementation:

### 🔴 Security State: Before Fixes

* **A01: Broken Access Control (CRITICAL)**:
  * *Vulnerability*: Stall Vendors could approve, reject, or refund reservation records belonging to other vendors by sending POST requests directly to endpoint paths.
  * *Audit Request*:
    ```http
    POST /api/reservations/4/approve
    Authorization: Bearer <vendor-b-token>
    ```
  * *Audit Response*:
    ```http
    HTTP/1.1 200 OK
    {"message":"Reservation approved"}
    ```
* **A01: Broken Access Control (OK)**:
  * *Status*: Vendors were correctly prevented from reading other vendors' booking details.
  * *Audit Check*: `GET /api/reservations/4` yielded `HTTP 404` or `HTTP 403`.
* **A07: Identification and Authentication Failures (OK)**:
  * *Status*: Missing or spoofed authorization tokens were rejected.
  * *Audit Check*: `GET /api/reservations/my` (without token) or `GET /api/reservations/my` (with invalid token) returned `HTTP 401 Unauthorized`.
* **A02: Cryptographic Failures (HIGH)**:
  * *Vulnerability*: Database passwords, mail connection keys, and JWT signature secrets were committed in plain text within config files.
  * *Audit File*: `application.properties` (contained `spring.datasource.password=12345` and committed SMTP passwords).
* **A05: Security Misconfiguration (MEDIUM)**:
  * *Vulnerability*: Cross-Origin Resource Sharing (CORS) rules permitted credential transmission from wildcard origin parameters.
  * *Audit Code*: `config.addAllowedOriginPattern("*"); config.setAllowCredentials(true);`

---

### 🟢 Security State: After Fixes

* **A01: Broken Access Control (FIXED)**:
  * *Remediation*: Vendor B is completely blocked from accessing or modifying Vendor A's reservation. Admin endpoints have been relocated under the `/api/admin/` prefix and secured with Spring Method Security `@PreAuthorize("hasRole('ADMIN')")`.
  * *Audit Request*:
    ```http
    POST /api/admin/reservations/4/approve
    Authorization: Bearer <vendor-b-token>
    ```
  * *Audit Response*:
    ```http
    HTTP/1.1 403 Forbidden
    {"message":"Access denied","error":"Forbidden"}
    ```
* **A05: Security Misconfiguration (FIXED)**:
  * *Remediation*: Any Vendor attempting to fetch administrative resource lists (e.g. `/api/admin/users`) is blocked with a clean `HTTP 403 Forbidden` response instead of general validation failures.
  * *Remediation (CORS)*: Origin parsing was restricted to explicit configuration mappings:
    `app.cors.allowed-origins=http://localhost:5173,http://localhost:3000`
* **A02: Cryptographic Failures (FIXED)**:
  * *Remediation*: Secrets were externalized out of version control and are now fed dynamically via environment variables (`DB_PASSWORD`, `JWT_SECRET`, `MAIL_PASSWORD`).
* **A09: Security Logging & Monitoring Failures (FIXED)**:
  * *Remediation*: Structured security logging is enabled to write audit records for all authentication events:
    `SECURITY login_success | login_failure | access_denied | invalid_token | reservation_approved`
* **A07: Identification and Authentication Failures (OK)**:
  * *Remediation*: Token validation and access rules are enforced. Lacking tokens yield `HTTP 401`. Login failures return a clean `HTTP 401` message.

---

## 7. Prerequisites
Ensure you have the following installed:
* **Java Development Kit (JDK)**: Version 17 or higher.
* **Node.js**: Version 18.x or higher (with `npm`).
* **MySQL Server**: Version 8.0 or higher.
* **Python**: Version 3.10 or higher.
* **Git**: Command-line version control.

An active Auth0 tenant and registered SPA application and API settings are required to test OIDC authentication.

---

## 8. Database Setup
The MySQL schema initialization script is located at:
[`database/schema.sql`](file:///c:/Users/ASUS/Documents/is/secure-stall-reservation-system/database/schema.sql)

To initialize your local database:
1. Open your terminal or shell.
2. Log into your MySQL instance:
   ```bash
   mysql -u root -p
   ```
3. Run the schema creation script:
   ```sql
   SOURCE c:/Users/ASUS/Documents/is/secure-stall-reservation-system/database/schema.sql;
   ```
This script creates the database `stall_reservation` and constructs all relational tables (users, events, stalls, reservations, payments, and audit logs) with foreign keys and auto-increment bounds.

---

## 9. Environment Configuration

### Backend variables
Export the following environment variables in your command terminal before booting the Spring Boot API:
```bash
# Database Configuration
DB_USERNAME=root
DB_PASSWORD=your_mysql_root_password

# OIDC Authority Details (Auth0 Issuer)
OIDC_ISSUER=https://your-tenant-name.us.auth0.com/
OIDC_AUDIENCE=https://bookfair-api

# SMTP Server Credentials (for automated reservation updates)
MAIL_USERNAME=your-smtp-username@example.com
MAIL_PASSWORD=your-smtp-app-password

# Keystore Credentials (HTTPS configuration)
SSL_KEYSTORE_PASSWORD=your_keystore_password
```

### Frontend variables
Create a `frontend/.env` file in the `/frontend` root directory:
```env
VITE_OIDC_AUTHORITY=https://your-tenant-name.us.auth0.com
VITE_OIDC_CLIENT_ID=your_registered_auth0_client_id
VITE_OIDC_REDIRECT_URI=https://localhost:5173/callback
VITE_OIDC_POST_LOGOUT_REDIRECT_URI=https://localhost:5173/
VITE_OIDC_AUDIENCE=https://bookfair-api
VITE_OIDC_SCOPE=openid profile email
```

---

## 10. SSL/TLS Keystore Generation
The backend comes pre-configured with a PKCS12 keystore file [`keystore.p12`](file:///c:/Users/ASUS/Documents/is/secure-stall-reservation-system/backend/src/main/resources/keystore.p12). 

To generate a new development keystore manually:
```bash
keytool -genkeypair -alias tomcat -keyalg RSA -keysize 2048 -storetype PKCS12 -keystore backend/src/main/resources/keystore.p12 -validity 3650
```
When prompted, set a secure keystore password and ensure it matches the `SSL_KEYSTORE_PASSWORD` environment variable passed during backend startup.

---

## 11. Running the Application

### Step 1: Start the ML Service
```bash
cd ml_service
pip install -r requirements.txt
python model_server.py
```
*Listens on*: `http://localhost:8003`

### Step 2: Start the Backend (Tomcat HTTPS)
Set the required environment variables in your terminal (e.g. PowerShell):
```powershell
$env:DB_USERNAME="root"
$env:DB_PASSWORD="your_mysql_password"
$env:OIDC_ISSUER="https://your-tenant.us.auth0.com/"
$env:OIDC_AUDIENCE="https://bookfair-api"
$env:MAIL_USERNAME="smtp_username"
$env:MAIL_PASSWORD="smtp_password"
$env:SSL_KEYSTORE_PASSWORD="keystore_password"
cd backend
.\mvnw.cmd spring-boot:run
```
*Listens on*: `https://localhost:8443`

### Step 3: Start the Frontend (Vite HTTPS)
```bash
cd frontend
npm install
npm run dev
```
*Listens on*: `https://localhost:5173`

Open your browser and navigate to `https://localhost:5173`. Accept the self-signed certificate warning to proceed.

---

## 12. Running Tests
To run unit and integration tests (which utilize mocked OIDC configurations to run independently of the external identity provider network status):
```bash
cd backend
.\mvnw.cmd clean test
```

---

## 13. Deployment
The application is designed as separate frontend, backend, database, and optional ML-service components.

For deployment:
1. Build the React application:
   ```bash
   cd frontend
   npm install
   npm run build
   ```
2. Build and test the Spring Boot backend:
   ```bash
   cd backend
   .\mvnw.cmd clean package
   ```
3. Configure production environment variables and database on the hosting platform.
4. Execute `database/schema.sql` on the production MySQL database.
5. Deploy the backend JAR using Java 17+.
6. Deploy the React `dist` output to a static hosting service.
7. Deploy the FastAPI service separately if recommendation functionality is required.
8. Configure the production frontend URL in the backend CORS allowlist.
9. Register production redirect URLs in Auth0 and use trusted SSL/TLS certificates.

---

## 14. Repository Security and Git Practices
The public source repository contains **no credentials, passwords, private keys, or API tokens**. 
* The `README.md` uses dummy placeholders for environment details.
* The `.gitignore` files actively block `.env`, `.keystore`, `target/`, and `node_modules/` from entering Git history.

---

## 15. Repository Link
The public codebase repository is hosted at:
👉 **[https://github.com/Krishnapiriyan/secure-stall-reservation-system](https://github.com/Krishnapiriyan/secure-stall-reservation-system)**
