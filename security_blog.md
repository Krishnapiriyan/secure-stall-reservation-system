# Securing Web Applications: OIDC Federated Auth & OWASP Top 10 Mitigations
### A Deep Dive into Building a Secure Stall Reservation Platform
*Published on Medium*

---

## Introduction
Security is one of the most important considerations when developing modern web applications. A system may provide all the required functionality, but weak authentication, authorization, input validation, or configuration can expose sensitive information and allow unauthorized operations.

As part of my Secure Web Application Development assessment, I enhanced an existing Book Fair Stall Reservation System by introducing multiple security mechanisms based on modern authentication standards and OWASP security practices.

The application uses a decoupled architecture with React for the frontend, Spring Boot for the backend, MySQL for data persistence, and Auth0 as the external Identity Provider.

The main objective was not simply to add a login page, but to ensure that authentication and authorization were enforced securely throughout the application.

---

## Existing Application Architecture
The application allows stall vendors to reserve stalls for book fair events while exhibition organizers manage events, stalls, and reservations.

The main technology stack consists of:
* **React and Vite** for the frontend, delivering a responsive Single Page Application (SPA).
* **Spring Boot and Spring Security** for the backend, hosting RESTful endpoints and managing web security filter chains.
* **Spring Data JPA and Hibernate** for persistence, mapping database entries to structural entity objects.
* **MySQL** as the relational database, serving as the central persistent data repository.
* **Auth0** for authentication, executing federated identity lookups.
* **OpenID Connect and OAuth 2.0** with JWT access tokens for modern authentication and authorization.
* **Spring WebSocket/STOMP** for real-time updates on stall availability across clients.
* **FastAPI and Scikit-Learn** for the recommendation service, analyzing genre historical popularity.

The system contains two main roles:
* `STALL_VENDOR` — can create reservations and access permitted operations related to their own reservations.
* `EXHIBITION_ORGANIZER` — can manage events, stalls, reservations, and other administrative functionality.

---

## Moving Authentication to Auth0
One of the most important security improvements was removing application-managed password authentication. Storing local passwords and custom password-reset mechanisms introduces huge exposure vectors to SQL injection, credential stuffing, and brute force attacks.

Instead of storing and validating user passwords inside the application database, authentication was delegated to Auth0. The application uses OpenID Connect (OIDC) together with OAuth 2.0 Authorization Code Flow with PKCE.

The simplified authentication flow is:
```text
User
  ↓
React Application
  ↓
Auth0 Authorization Endpoint
  ↓
User Authentication
  ↓
Authorization Code
  ↓
PKCE Code Verification
  ↓
Access Token
  ↓
React Application
  ↓
Authorization: Bearer <token>
  ↓
Spring Boot API
```

### Cryptographic Details of PKCE
PKCE (Proof Key for Code Exchange) provides additional protection to the authorization-code flow by associating the authorization request with a cryptographically generated code verifier. 

This was particularly appropriate because the React frontend is a public client and cannot safely maintain a traditional client secret:
1. **Code Verifier**: The React frontend generates a cryptographically secure random string using the browser's `window.crypto.getRandomValues()` API. This string consists of A-Z, a-z, 0-9, and punctuation symbols, with a length of 64 characters.
2. **Code Challenge**: The verifier is hashed using SHA-256 (`window.crypto.subtle.digest('SHA-256')`). The resulting array buffer is then transformed using a URL-safe Base64 encoding scheme (removing trailing `=`, mapping `+` to `-`, and `/` to `_`).
3. **Redirection Parameters**: The challenge is sent to Auth0 during redirection as `code_challenge`, along with `code_challenge_method=S256`.
4. **Token Verification**: When Auth0 returns the code, the React app exchanges it by sending the original `code_verifier`. Auth0 hashes this verifier and confirms it matches the challenge before releasing tokens. This prevents attackers from stealing the authorization code in transit.

---

## JWT Validation in Spring Security
Receiving a JWT from the frontend does not mean that the backend should automatically trust it.

The Spring Boot application operates as an OAuth 2.0 Resource Server. For protected API requests, Spring Security validates important properties of the access token, including:
* **Cryptographic Signature**: Validated dynamically using public keys fetched from the Auth0 JWKS endpoint (`/.well-known/jwks.json`).
* **Issuer (`iss`)**: Verifying the token was signed by the expected tenant domain.
* **Audience (`aud`)**: Verifying the token was issued for our backend API identifier.
* **Expiration (`exp`)**: Ensuring the token is still active and has not expired.
* **Authorization Claims**: Reading role claims.

The roles supplied through the trusted authentication token are converted into Spring Security authorities such as:
* `ROLE_STALL_VENDOR`
* `ROLE_EXHIBITION_ORGANIZER`

The backend can then make authorization decisions independently of the frontend. Hiding a button in the frontend is not authorization. Authorization must be enforced by the server.

---

## Preventing Broken Access Control and IDOR
One of the most important vulnerabilities considered during the enhancement was Broken Access Control (OWASP A01:2021).

For example, imagine the following endpoint:
`/api/reservations/25`

If Vendor A owns reservation 24, simply changing the URL from 24 to 25 must not allow Vendor A to retrieve Vendor B's reservation. This type of problem is commonly associated with Insecure Direct Object Reference (IDOR) or broken object-level authorization.

The application therefore performs ownership checks on the backend. When a Vendor requests a reservation detail, the service fetches the database record, checks `reservation.vendor.id`, and validates if it matches the authenticated user ID:

```text
   Authenticated User
        ↓
 Requested Reservation
        ↓
Check Reservation Owner
        ↓
      Owner?
   ↙         ↘
 YES         NO
  ↓           ↓
Allow    403 Forbidden
```

I tested this protection using different vendor accounts. When one vendor attempted to access another vendor’s reservation, the server returned `403 Forbidden` and blocked access. This demonstrated why authentication and authorization are different concepts:
* **Authentication** determines who the user is.
* **Authorization** determines what that authenticated user is allowed to do.

---

## Preventing Client-Side Identity Manipulation
Another important design decision was to avoid trusting a vendor ID supplied by the frontend when creating security-sensitive resources.

An attacker can manipulate HTTP request bodies even if the normal user interface does not provide that functionality. Instead, the backend obtains the authenticated user’s identity from the validated Spring Security authentication context.

During JIT-provisioning, the database assigns a persistent ID to the vendor record. When the vendor calls the book endpoint, the backend looks up their ID from the principal object bound during validation (`auth.getPrincipal()`) and uses that resolved ID to link the booking record. Changing a vendor ID parameter in a manually crafted request has zero impact on ownership.

---

## Role-Based Access Control
The system implements server-side Role-Based Access Control (RBAC).

For example, administrative APIs (such as approve, reject, and refund) are restricted to the `EXHIBITION_ORGANIZER` role. Vendor routes are locked down using filter chains.

This means a `STALL_VENDOR` cannot gain organizer functionality simply by manually entering an administrative URL or sending an HTTP request directly to the backend. During security testing, a vendor request to an organizer-only endpoint correctly resulted in a `403 Forbidden` response.

---

## Securing User Profile Updates
Mass assignment is a security concern where a client binds parameters that they should not have rights to modify.

A profile update endpoint should not allow a user to submit fields such as:
```json
{
  "role": "EXHIBITION_ORGANIZER",
  "active": true
}
```
and accidentally cause those security-sensitive properties to be updated.

Profile modification was therefore restricted to specifically permitted fields (such as phone and businessName). Security-sensitive attributes such as the user’s role, OIDC subject identifier, internal ID, and active status cannot be modified through the profile-update operation. This follows the principle of explicitly allowing expected input instead of blindly accepting arbitrary object properties.

---

## Input Validation
Input validation was strengthened using Jakarta Bean Validation.

Examples of validation annotations used include:
* `@NotNull`, `@NotBlank`, `@NotEmpty` — enforcing presence of inputs.
* `@Size`, `@Min`, `@DecimalMin` — restricting string lengths and financial bounds.
* `@FutureOrPresent` — restricting dates (like the booking reservation date) to today or the future.

Controlled values such as payment methods and stall sizes are represented using enums. For example, invalid values such as an unsupported stall size are rejected instead of being processed by the business logic. Validation was applied to reservation and event request DTOs so malformed requests are rejected at the API boundary.

---

## SQL Injection Protection
SQL injection was also considered during the security review.

The backend uses Spring Data JPA and Hibernate, and repository parameters are bound rather than constructing SQL statements by concatenating untrusted user input. A review of the application did not identify dynamically concatenated native SQL being used for these operations. Using parameterized persistence operations significantly reduces SQL injection risk compared with manually constructing SQL statements from request values.

---

## Cross-Site Scripting Protection
The React frontend was reviewed for unsafe HTML rendering.

The application does not intentionally use mechanisms such as `dangerouslySetInnerHTML` for rendering untrusted application content. React’s standard rendering behavior escapes text values, helping reduce XSS risk. A Content Security Policy (CSP) is also configured as an additional browser-side security control.

---

## Restricting CORS
Cross-Origin Resource Sharing configuration was another important security area.

A permissive configuration such as allowing every origin (`*`) can unnecessarily expose APIs to cross-origin browser requests. The application therefore uses a restricted CORS allowlist.

I tested the configuration using a request containing an unauthorized origin:
`Origin: https://evil-example.com`

The server responded with:
`HTTP/1.1 403 Invalid CORS request`
and did not grant that origin access.

---

## Securing WebSocket Communication
The application also uses WebSocket/STOMP communication for real-time stall updates. Securing only normal REST endpoints would therefore have been incomplete.

The STOMP connection requires a Bearer access token during the connection process. The backend validates the JWT before associating the connection with an authenticated user. Administrative WebSocket subscriptions are additionally restricted according to the user’s authorization role. This helped me understand that every communication mechanism in an application requires its own security considerations.

---

## HTTPS and Security Headers
The Spring Boot backend was configured to operate over HTTPS during development.

Additional HTTP security controls include headers such as:
* **HTTP Strict Transport Security (HSTS)**: Forcing browsers to connect using HTTPS.
* **Content Security Policy (CSP)**: Blocking untrusted external scripts.
* **Frame Protection (X-Frame-Options: DENY)**: Preventing clickjacking attacks.
* **X-Content-Type-Options: nosniff**: Preventing MIME-sniffing exploits.

HTTPS protects information transmitted between the frontend and backend from being sent as ordinary plaintext over the network. For production systems, a certificate issued by a trusted Certificate Authority should be used instead of a local development certificate.

---

## Secure File Upload Handling
Administrative media uploads were another area where untrusted input needed to be considered.

The application restricts accepted MIME types and upload sizes. Instead of trusting the filename supplied by the client, the backend generates unique filenames using UUID values and determines permitted extensions on the server. This reduces risks associated with malicious filenames, filename collisions, and unrestricted file types. File upload security could be hardened even further in a production environment using deeper file-content inspection and malware scanning.

---

## Protecting Secrets
One of the easiest security mistakes is committing credentials directly into source code.

Sensitive configuration such as database passwords, email passwords, OIDC config parameters, and SSL keystore credentials are provided through environment variables. Real `.env` files, private keystores, runtime uploads, and similar sensitive/local files are excluded from version control. Only example configuration values and placeholders are stored in the public repository. This makes it possible for another developer to configure the application without exposing my actual credentials.

---

## OWASP Security Audit Report: Before vs. After Fixes

To verify our changes, we ran a security audit before and after the enhancements. The results are summarized below:

### 🔴 Legacy Vulnerabilities (Before Fixes)
1. **Broken Access Control (A01 - CRITICAL)**: Any Vendor could approve other vendors' bookings:
   * *Request*: `POST /api/reservations/4/approve` (with Vendor B's token) -> Returned `HTTP 200` `{"message":"Reservation approved"}`.
2. **Cryptographic Failures (A02 - HIGH)**: Configuration properties contained plain-text secrets like `spring.datasource.password=12345` and mail SMTP passwords.
3. **Security Misconfiguration (A05 - MEDIUM)**: CORS config allowed wildcard origin matching with credentials allowed:
   * *Config*: `config.addAllowedOriginPattern("*"); config.setAllowCredentials(true);`

### 🟢 Security Remediations (After Fixes)
1. **Broken Access Control (A01 - FIXED)**: All admin actions are moved under `/api/admin/reservations/**` and restricted with `@PreAuthorize("hasRole('ADMIN')")`. Accessing this path with a vendor token now results in `HTTP 403 Forbidden`.
2. **Security Misconfiguration (A05 - FIXED)**: Any Vendor calling administrative paths (e.g., `GET /api/admin/users`) is blocked with a clean `403 Forbidden` response instead of generic errors. CORS is locked down to explicit domain strings.
3. **Cryptographic Failures (A02 - FIXED)**: All database, JWT, and SMTP credentials are externalized to environment variables.
4. **Security Logging & Monitoring (A09 - FIXED)**: Added security audit logging:
   `SECURITY login_success | login_failure | access_denied | invalid_token | reservation_approved`
5. **Authentication Failures (A07 - OK)**: Token validations are fully operational and unauthorized REST queries return `HTTP 401`.

---

## Security Testing
Security controls should not only be implemented; they should also be tested.

Some of the tests I performed included:
* **No authentication token** → `401 Unauthorized`
* **Invalid JWT** → `401 Unauthorized`
* **Vendor accessing organizer endpoint** → `403 Forbidden`
* **Vendor accessing another vendor's reservation** → `403 Forbidden`
* **Deactivated user accessing protected functionality** → `403 Forbidden`
* **Unauthorized CORS origin** → `403 Invalid CORS request`
* **Invalid event/reservation data** → Request rejected
* **Valid WebSocket JWT** → Authenticated STOMP connection

These tests helped verify that the security configuration behaved as expected rather than relying only on source-code inspection.

---

## Challenges Faced
One of the biggest challenges was integrating an external Identity Provider with an application that already maintained local users.

Auth0 identifies users using an OIDC `sub` claim, while the application still requires local database records for business information and relationships. Therefore, the system needed to map the authenticated OIDC identity to the appropriate local user.

Another challenge involved role synchronization. Authentication roles provided through the validated token needed to correspond correctly with the application’s local role model.

Testing was another interesting challenge. A Spring Boot context test initially attempted to contact a fake OIDC issuer during startup. The test environment was later isolated by mocking the JWT decoder while leaving the production JWT validation configuration unchanged.

WebSocket authentication was also different from normal REST security because the STOMP connection needed authentication during its connection lifecycle.

These challenges showed me that adding authentication is only one part of application security. Identity must be integrated correctly throughout the entire application architecture.

---

## Key Learning Outcomes
This project significantly improved my understanding of practical web application security.

The most important lessons I learned were:
1. **Authentication is not authorization.** Knowing who a user is does not automatically mean they should have access to a particular resource.
2. **Never trust the frontend for security decisions.** Frontend restrictions improve the user experience, but an attacker can construct requests manually.
3. **Identity should come from trusted authentication data.** Security-sensitive user identity should be derived from a validated token rather than request parameters.
4. **Authorization must include resource ownership.** RBAC alone is sometimes insufficient. Two users can have the same role while still owning different resources.
5. **Security should exist across every communication mechanism.** REST APIs, WebSockets, file uploads, database access, and configuration each introduce different security considerations.
6. **Secrets do not belong in source control.** Environment variables and deployment secret-management mechanisms should be used instead.
7. **Security requires testing.** A security configuration should be verified using unauthorized, malformed, and adversarial requests.

---

## Conclusion
Enhancing the Book Fair Stall Reservation System gave me practical experience applying security concepts beyond theoretical examples.

By integrating Auth0, OpenID Connect, OAuth 2.0 with PKCE, JWT validation, Spring Security, RBAC, object-level authorization, input validation, HTTPS, secure WebSockets, restricted CORS, and secure configuration management, the application now has multiple layers of protection.

The most valuable lesson from this assessment was that secure software development is not about implementing one security feature. It requires considering how authentication, authorization, data validation, communication, persistence, configuration, and application logic work together.

---

## Source Code
The complete project is available in my public GitHub repository:
👉 **[Secure Stall Reservation System on GitHub](https://github.com/Krishnapiriyan/secure-stall-reservation-system)**
