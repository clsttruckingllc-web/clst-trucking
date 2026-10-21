# VPS deployment (Ubuntu/Debian)

Use a small Linux VPS with a public IPv4 address and a provider/firewall that permits outbound TLS SIP and the UDP/SRTP media traffic required by RingCentral. A normal static website host is not enough. This guide does not create the VPS or RingCentral SIP endpoint for you.

## 1. Create a separate AI SIP endpoint first

In RingCentral, provision a dedicated **Existing Phone / OtherPhone** endpoint for this service and obtain its SIP info. Do not share the physical desk phone's SIP credentials with this service. Keep the company number's call routing unchanged during the test.

## 2. Prepare the server

On a fresh Ubuntu/Debian VPS, connect using SSH and install Docker Engine plus the Docker Compose plugin using the official Docker installation instructions. Then clone the repository:

```bash
git clone https://github.com/clsttruckingllc-web/clst-trucking.git
cd clst-trucking/voice-service
cp .env.example .env
nano .env
```

Fill in the values from the dedicated AI SIP endpoint and your Gemini account. Create a new long random `VOICE_API_KEY` and set `TEST_CALL_TO` to your own test phone in E.164 format. Never put real credentials in GitHub or paste them into a public issue.

## 3. Start the service

From the `voice-service` directory:

```bash
chmod 600 .env
docker compose -f compose.yaml up -d --build
docker compose -f compose.yaml logs -f
```

The compose file uses Linux host networking so SIP/media traffic is not hidden behind Docker's default NAT. It is intended for Linux VPS hosts.

## 4. Check status

From the VPS:

```bash
curl http://127.0.0.1:8080/health
```

Wait for `"sipRegistered":true`. If it remains false, check the service logs and verify SIP domain, regional outbound proxy, username, password, authorization ID, provider firewall, and endpoint registration. Do not try a test call until SIP registration succeeds.

## 5. Secure the HTTP endpoint before remote use

Do not expose port 8080 directly to the public internet. Keep it reachable only from localhost or a trusted private network, or put it behind a TLS reverse proxy with IP restrictions. The `VOICE_API_KEY` is required for `POST /test-call`, but it is still important to limit access and use HTTPS.

Once secured, request `POST /test-call` with `Authorization: Bearer <VOICE_API_KEY>`. The server calls only the preconfigured `TEST_CALL_TO`; it does not accept a caller-supplied destination and does not alter company routing.

## Important limitations

- A successful Docker build is not proof that RingCentral SIP registration or audio works.
- This is a one-way spoken greeting test, not yet a full conversational receptionist.
- Do not route the main company number to this service until registration, inbound/outbound audio, transfer behavior, and recovery have been tested.
- Hosting provider network policies vary. Confirm TLS SIP and UDP/SRTP are allowed before paying for a plan.
