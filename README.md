# PPM-ExchangeOrchestrator: A Complete Guide for New Engineers

**Welcome!** This document is written for engineers who are new to this codebase. We'll start from the very beginning and build up your understanding step by step.

---

## Table of Contents

1. [What Is This System? (The Big Picture)](#1-what-is-this-system-the-big-picture)
2. [Key Concepts You Need to Understand First](#2-key-concepts-you-need-to-understand-first)
3. [How the System Works (Step by Step)](#3-how-the-system-works-step-by-step)
4. [The Codebase Structure (Where to Find Things)](#4-the-codebase-structure-where-to-find-things)
5. [Understanding the Request Journey](#5-understanding-the-request-journey)
6. [Authentication: How We Know Who's Calling](#6-authentication-how-we-know-whos-calling)
7. [Orchestrators: The Brain of the System](#7-orchestrators-the-brain-of-the-system)
8. [SAPI: The Backend We Talk To](#8-sapi-the-backend-we-talk-to)
9. [Coverage Ingestion: The Smart Matching System](#9-coverage-ingestion-the-smart-matching-system)
10. [Error Handling: What Happens When Things Go Wrong](#10-error-handling-what-happens-when-things-go-wrong)
11. [Feature Flags: Emergency Controls](#11-feature-flags-emergency-controls)
12. [Metrics and Logging: How We Monitor Things](#12-metrics-and-logging-how-we-monitor-things)
13. [Common Tasks for New Engineers](#13-common-tasks-for-new-engineers)
14. [Glossary: All the Terms Explained](#14-glossary-all-the-terms-explained)
15. [FAQ: Questions New Engineers Often Ask](#15-faq-questions-new-engineers-often-ask)

---

## 1. What Is This System? (The Big Picture)

### 1.1 The Simple Explanation

**Think of GEICO like a restaurant.** GEICO has a kitchen (the backend systems) that can make insurance quotes and policies. But instead of customers coming directly to the restaurant, GEICO has partnered with food delivery apps (like Uber Eats, DoorDash) to reach more customers.

**This system (PPM-ExchangeOrchestrator) is like the restaurant's order management system** that:
- Receives orders from different delivery apps (partners like Amazon, Insurify, Zebra)
- Translates each app's order format into what the kitchen understands
- Sends the order to the kitchen
- Gets the prepared food back
- Packages it in the format each delivery app expects

### 1.2 The Real Explanation

**PPM-ExchangeOrchestrator** (we call it "PPMXPO" for short) is a middleware service that allows external partner companies to offer GEICO auto insurance quotes to their customers.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│   PARTNER COMPANIES                    THIS SYSTEM              GEICO        │
│   (External)                           (What you're            (Internal)    │
│                                         working on)                          │
│                                                                              │
│   ┌──────────┐                        ┌──────────┐           ┌──────────┐   │
│   │  Amazon  │───────────────────────▶│          │──────────▶│          │   │
│   └──────────┘                        │          │           │          │   │
│                                       │  PPMXPO  │           │   SAPI   │   │
│   ┌──────────┐                        │          │           │ (Sales   │   │
│   │ Insurify │───────────────────────▶│  (This   │◀──────────│  API)    │   │
│   └──────────┘                        │  System) │           │          │   │
│                                       │          │           │          │   │
│   ┌──────────┐                        │          │           │          │   │
│   │  Zebra   │───────────────────────▶│          │──────────▶│          │   │
│   └──────────┘                        └──────────┘           └──────────┘   │
│                                                                              │
│   Each partner has their              We translate and        The "kitchen" │
│   own way of asking for               orchestrate             that actually │
│   insurance quotes                    everything              makes quotes  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Why Does This System Exist?

**Problem:** GEICO wants to sell insurance through partner websites, but:
- Each partner has different technical requirements
- Partners don't want to learn GEICO's complex internal systems
- GEICO doesn't want to expose internal systems directly
- Different partners need different features

**Solution:** Build a "translator" system (this one!) that:
- Provides a simple, clean API for partners
- Handles all the complexity internally
- Can be customized per partner
- Protects GEICO's internal systems

### 1.4 What Does "PPM-ExchangeOrchestrator" Mean?

Let's break down the name:
- **PPM** = Partner Platform Marketplace (the business initiative)
- **Exchange** = We exchange data between partners and GEICO
- **Orchestrator** = We coordinate (orchestrate) multiple steps to complete a request

---

## 2. Key Concepts You Need to Understand First

Before diving into the code, let's understand some fundamental concepts.

### 2.1 What is "Quoting" in Insurance?

When someone wants car insurance, they need a **quote** - an estimate of how much their insurance will cost.

**The Quote Process (Simplified):**
```
1. Customer provides information:
   - Personal details (name, date of birth, address)
   - Vehicle details (year, make, model)
   - Driving history (accidents, tickets)

2. Insurance company calculates:
   - Risk level (how likely is this person to file a claim?)
   - Premium (how much should they pay?)

3. Customer receives:
   - Quote with price options
   - Different coverage levels to choose from
```

### 2.2 What are "Coverages"?

Insurance coverage is what the insurance company will pay for if something bad happens.

**Common Auto Insurance Coverages:**

| Coverage Code | Full Name | What It Covers |
|---------------|-----------|----------------|
| **BI** | Bodily Injury | If you hurt someone in an accident |
| **PD** | Property Damage | If you damage someone's property |
| **COMP** | Comprehensive | Non-collision damage (theft, weather, etc.) |
| **COLL** | Collision | Damage from hitting something |
| **UMBI** | Uninsured Motorist Bodily Injury | If an uninsured driver hurts you |

**Coverage has "limits" and "deductibles":**
- **Limit** = Maximum the insurance will pay (e.g., $100,000)
- **Deductible** = What you pay first before insurance kicks in (e.g., $500)

**Example:** BI coverage of "100/300" means:
- $100,000 maximum per person injured
- $300,000 maximum per accident total

### 2.3 What is SAPI?

**SAPI (Sales API)** is GEICO's internal system that actually generates insurance quotes and processes policy purchases.

**Think of it like this:**
- SAPI = The chef in the kitchen
- PPMXPO = The waiter who takes orders and serves food
- Partners = The customers at different tables

**We never expose SAPI directly to partners.** Instead, we:
1. Receive partner requests
2. Translate them to SAPI format
3. Call SAPI
4. Translate SAPI's response back
5. Return to partner

### 2.4 What is a "Partner"?

A partner is an external company that has an agreement with GEICO to offer insurance quotes on their platform.

**Current Partners Include:**
- Amazon
- JerryAI
- Insurify
- Zebra
- CreditKarma
- Experian
- And more...

Each partner:
- Has a unique identifier (Partner ID)
- May have different features enabled/disabled
- May have certain states or zip codes blocked
- Has their own OAuth2 credentials

---

## 3. How the System Works (Step by Step)

Let's walk through what happens when a partner requests an insurance quote.

### 3.1 The Complete Journey of a Quote Request

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    THE LIFE OF A QUOTE REQUEST                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  STEP 1: Partner Sends Request                                               │
│  ─────────────────────────────                                               │
│                                                                              │
│  Partner (e.g., Amazon) sends an HTTPS POST request:                        │
│                                                                              │
│    POST /v1/personal/auto/quote                                              │
│    Authorization: Bearer <jwt_token>                                         │
│    Content-Type: application/json                                            │
│                                                                              │
│    {                                                                         │
│      "salesContext": {                                                       │
│        "mailingAddress": { "stateCode": "TX", "postalCode": "75001" },      │
│        "operators": [{ "firstName": "John", "lastName": "Doe", ... }],      │
│        "autos": [{ "year": 2020, "make": "Toyota", "model": "Camry" }]      │
│      },                                                                      │
│      "coveragePackages": { ... }  // Optional: specific coverages wanted    │
│    }                                                                         │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  STEP 2: Security Filters Process the Request                               │
│  ─────────────────────────────────────────────                               │
│                                                                              │
│  Before reaching our code, the request passes through filters:              │
│                                                                              │
│    ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐      │
│    │ Timeout Filter  │────▶│  JWT Decode     │────▶│ Correlation ID  │      │
│    │                 │     │  Filter         │     │ Filter          │      │
│    │ Records when    │     │                 │     │                 │      │
│    │ request started │     │ Extracts who    │     │ Adds tracking   │      │
│    │ (for timeout    │     │ is calling      │     │ ID for logs     │      │
│    │ tracking)       │     │ (partner ID)    │     │                 │      │
│    └─────────────────┘     └─────────────────┘     └─────────────────┘      │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  STEP 3: Controller Receives Request                                         │
│  ────────────────────────────────────                                         │
│                                                                              │
│  The V1Controller receives the validated request:                            │
│                                                                              │
│    1. Validates the request data (are all required fields present?)         │
│    2. Checks if the state/zip is allowed for this partner                   │
│    3. Loads partner-specific configuration                                   │
│    4. Passes everything to the Orchestrator                                  │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  STEP 4: Orchestrator Coordinates SAPI Calls                                 │
│  ───────────────────────────────────────────────                             │
│                                                                              │
│  The Orchestrator is the "brain" that knows what SAPI calls to make:        │
│                                                                              │
│    ┌──────────────┐     ┌──────────────┐     ┌──────────────┐              │
│    │   SAPI       │     │   SAPI       │     │   SAPI       │              │
│    │   Init       │────▶│   Save       │────▶│   Quote      │              │
│    │              │     │              │     │              │              │
│    │ Start a new  │     │ Save all the │     │ Calculate    │              │
│    │ quote session│     │ customer &   │     │ the actual   │              │
│    │              │     │ vehicle data │     │ price        │              │
│    └──────────────┘     └──────────────┘     └──────────────┘              │
│                                                                              │
│  If partner requested specific coverages, we also:                           │
│    - Match their requested coverages to GEICO's available options           │
│    - Include matched coverages in the quote request                          │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  STEP 5: Response Sent Back to Partner                                       │
│  ──────────────────────────────────────                                       │
│                                                                              │
│  We transform SAPI's response into partner-friendly format:                  │
│                                                                              │
│    {                                                                         │
│      "quoteId": "abc123",                                                    │
│      "premium": { "annual": 1200.00, "monthly": 100.00 },                   │
│      "coveragePackages": [...],                                              │
│      "recallKey": "xyz789"  // Used to retrieve this quote later            │
│    }                                                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 The Three Main SAPI Operations

Almost every quote involves these three SAPI calls:

| Step | SAPI Endpoint | Purpose | Analogy |
|------|---------------|---------|---------|
| 1. **Init** | `/api/initialize/` | Start a new session | Opening a new order ticket |
| 2. **Save** | `/api/save/` | Save all customer data | Writing down the order details |
| 3. **Quote** | `/api/quote/` | Calculate the price | Kitchen prepares the food |

**Why three steps?** SAPI was designed for GEICO's internal systems where a user might fill out a form over multiple pages. Each "save" preserves their progress. We make all three calls in sequence because partners send everything at once.

---

## 4. The Codebase Structure (Where to Find Things)

### 4.1 The Main Folders Explained

```
src/main/java/com/geico/ppmexchangeorchestrator/
│
├── 📁 controller/          ← WHERE REQUESTS COME IN
│   │                         These classes handle HTTP endpoints
│   │
│   ├── V1Controller.java            # /v1/personal/auto/* endpoints
│   ├── LegacyController.java        # Old partner endpoints (backward compatibility)
│   ├── v2/
│   │   ├── QuoteController.java     # /personal/auto/v2/* endpoints
│   │   └── LookupController.java    # Vehicle lookup endpoints
│   └── ia/
│       └── IAQuoteController.java   # Independent Agent endpoints
│
├── 📁 orchestrator/        ← WHERE BUSINESS LOGIC LIVES
│   │                         These classes coordinate SAPI calls
│   │
│   ├── QuoteOrchestrator.java                    # V2 quote logic
│   ├── CoverageIngestionQuoteOrchestrator.java   # V1 quote with coverage matching
│   ├── BindOrchestrator.java                     # Policy binding logic
│   ├── RecallOrchestrator.java                   # Retrieving existing quotes
│   └── LookUpOrchestrator.java                   # Vehicle lookups
│
├── 📁 service/             ← WHERE EXTERNAL CALLS ARE MADE
│   │
│   ├── SapiServiceProxy.java        # Makes HTTP calls to SAPI
│   └── CoveragesDataService.java    # Provides coverage data from config
│
├── 📁 mapper/              ← WHERE DATA TRANSFORMATION HAPPENS
│   │                         Converts between different data formats
│   │
│   ├── SapiRequestMapper.java       # Partner request → SAPI request
│   ├── automapper/                  # MapStruct auto-generated mappers
│   └── response/                    # SAPI response → Partner response
│
├── 📁 filter/              ← WHERE REQUESTS ARE PRE-PROCESSED
│   │
│   ├── JwtDecodeFilter.java         # Extracts partner ID from JWT token
│   ├── CorrelationIdFilter.java     # Adds tracking ID for logs
│   └── RequestTimeoutFilter.java    # Tracks request timing
│
├── 📁 model/               ← DATA STRUCTURES
│   │
│   ├── personalauto/v1/             # V1 API request/response models
│   ├── personalauto/v2/             # V2 API request/response models
│   ├── exception/                   # Custom exception classes
│   └── shared/                      # Shared models
│
├── 📁 config/              ← CONFIGURATION CLASSES
│   │
│   ├── PartnerConfig.java           # Partner-specific settings
│   ├── SecurityConfig.java          # OAuth2/JWT configuration
│   └── FeatureFlagConfig.java       # Feature flags (emergency controls)
│
├── 📁 exception/           ← ERROR HANDLING
│   │
│   ├── GlobalExceptionHandler.java  # Catches and formats errors
│   └── LegacyExceptionHandler.java  # Error handling for legacy endpoints
│
└── 📁 util/                ← HELPER UTILITIES
    │
    ├── coveragematching/            # Coverage matching algorithm
    ├── metric/                      # Metrics utilities
    └── *.java                       # Various helper classes
```

### 4.2 Quick Reference: "I Want to..."

| If You Want To... | Look In... |
|-------------------|------------|
| See what endpoints exist | `controller/` folder |
| Understand the quote flow | `orchestrator/QuoteOrchestrator.java` |
| See how we call SAPI | `service/SapiServiceProxy.java` |
| Understand request transformation | `mapper/SapiRequestMapper.java` |
| See partner configurations | `config/PartnerConfig.java` |
| Understand error responses | `exception/GlobalExceptionHandler.java` |
| See coverage matching logic | `util/coveragematching/CoverageMatchUtil.java` |

---

## 5. Understanding the Request Journey

### 5.1 Filters: The Security Checkpoint

Before any request reaches our controllers, it passes through **filters**. Think of filters like security checkpoints at an airport.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FILTER CHAIN                                       │
│                   (Every request passes through these)                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   INCOMING REQUEST                                                           │
│         │                                                                    │
│         ▼                                                                    │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  FILTER 1: RequestTimeoutFilter                                      │   │
│   │  ─────────────────────────────────                                   │   │
│   │                                                                      │   │
│   │  Purpose: Start the "clock" for this request                        │   │
│   │                                                                      │   │
│   │  What it does:                                                       │   │
│   │    • Records the current time (when request started)                │   │
│   │    • Stores the timeout limit (default: 30 seconds)                 │   │
│   │                                                                      │   │
│   │  Why we need it:                                                     │   │
│   │    If a request takes too long, we need to stop it gracefully      │   │
│   │    rather than making the partner wait forever.                     │   │
│   │                                                                      │   │
│   │  File: filter/RequestTimeoutFilter.java                             │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│         │                                                                    │
│         ▼                                                                    │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  FILTER 2: JwtDecodeFilter                                           │   │
│   │  ──────────────────────────                                          │   │
│   │                                                                      │   │
│   │  Purpose: Figure out WHO is making this request                     │   │
│   │                                                                      │   │
│   │  What it does:                                                       │   │
│   │    1. Extracts the JWT token from "Authorization: Bearer <token>"   │   │
│   │    2. Decodes the token to get the "oid" (Object ID)                │   │
│   │    3. Looks up the oid in our partner configuration                 │   │
│   │    4. Sets the partner ID (e.g., "AMAZON", "INSURIFY")              │   │
│   │    5. Checks if this partner is disabled (feature flag)            │   │
│   │                                                                      │   │
│   │  If something's wrong:                                               │   │
│   │    • Invalid token → 401 Unauthorized                               │   │
│   │    • Unknown partner → 401 "Client OID not recognized"              │   │
│   │    • Partner disabled → 403 Forbidden                               │   │
│   │                                                                      │   │
│   │  File: filter/JwtDecodeFilter.java                                  │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│         │                                                                    │
│         ▼                                                                    │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  FILTER 3: CorrelationIdFilter                                       │   │
│   │  ────────────────────────────                                        │   │
│   │                                                                      │   │
│   │  Purpose: Add a tracking number to this request                     │   │
│   │                                                                      │   │
│   │  What it does:                                                       │   │
│   │    • Checks if partner sent "X-Correlation-Id" header               │   │
│   │    • If yes: uses that ID                                           │   │
│   │    • If no: generates a new UUID                                    │   │
│   │    • Stores the ID for use in all log messages                      │   │
│   │                                                                      │   │
│   │  Why we need it:                                                     │   │
│   │    When debugging issues, this ID lets us trace a single request   │   │
│   │    across all our logs and even into SAPI's logs.                   │   │
│   │                                                                      │   │
│   │  File: filter/CorrelationIdFilter.java                              │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│         │                                                                    │
│         ▼                                                                    │
│   REQUEST CONTINUES TO CONTROLLER                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 What is MDC? (You'll See This Everywhere)

**MDC = Mapped Diagnostic Context**

It's a way to attach information to the current request that all our log statements can access.

```java
// In JwtDecodeFilter
MDC.put("partnerId", "AMAZON");

// Later, in any class, any log message automatically includes this:
log.info("Processing quote request");
// Output: {"partnerId": "AMAZON", "message": "Processing quote request", ...}
```

**Why is this useful?** When looking at logs, you can filter by partner ID to see only that partner's requests.

---

## 6. Authentication: How We Know Who's Calling

### 6.1 The JWT Token

Partners authenticate using **JWT (JSON Web Token)**. Think of a JWT like a concert ticket that proves who you are.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         HOW JWT AUTHENTICATION WORKS                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  STEP 1: Partner Gets a Token (This happens BEFORE calling us)              │
│  ─────────────────────────────────────────────────────────────               │
│                                                                              │
│    Partner Server                          Microsoft Azure AD                │
│         │                                         │                          │
│         │  "I'm Amazon, here's my secret"        │                          │
│         │────────────────────────────────────────▶│                          │
│         │                                         │                          │
│         │     "OK, here's your token (valid 1hr)" │                          │
│         │◀────────────────────────────────────────│                          │
│         │                                         │                          │
│                                                                              │
│  STEP 2: Partner Calls Us With the Token                                     │
│  ───────────────────────────────────────                                     │
│                                                                              │
│    Partner Server                          Our System (PPMXPO)               │
│         │                                         │                          │
│         │  POST /v1/personal/auto/quote           │                          │
│         │  Authorization: Bearer eyJhbGci...      │                          │
│         │────────────────────────────────────────▶│                          │
│         │                                         │                          │
│                                                                              │
│  STEP 3: We Validate and Decode the Token                                    │
│  ────────────────────────────────────────                                    │
│                                                                              │
│    The JWT token contains (when decoded):                                    │
│                                                                              │
│    {                                                                         │
│      "iss": "https://login.microsoftonline.com/...",  // Who issued it      │
│      "aud": "api://ppmxpo",                           // Intended for us    │
│      "oid": "0f7e25db-ce4a-4e3c-bfed-892214885438",  // Partner's unique ID │
│      "exp": 1702234567                                // Expiration time    │
│    }                                                                         │
│                                                                              │
│  STEP 4: We Map the OID to a Partner Name                                    │
│  ────────────────────────────────────────                                    │
│                                                                              │
│    Our configuration (partner-configuration.yml):                            │
│                                                                              │
│    partnerOidsToConfigurations:                                              │
│      "0f7e25db-ce4a-4e3c-bfed-892214885438": "AMAZON"                       │
│      "a219c62e-e17c-457a-905c-e4cb7385acad": "JERRYAI"                       │
│      "eb99fb19-7ea1-4b36-aa70-de27a608e172": "INSURIFY"                      │
│                                                                              │
│    So oid "0f7e25db-..." becomes partnerId "AMAZON"                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Where to Find Partner Configurations

**File:** `src/main/resources/partner-configuration.yml`

This file maps partner OIDs to partner names and configures partner-specific settings like:
- Blocked states (states where this partner can't offer quotes)
- Blocked zip codes
- Partner-specific feature flags

---

## 7. Orchestrators: The Brain of the System

### 7.1 What is an Orchestrator?

An **Orchestrator** is a class that coordinates multiple steps to complete a business operation.

**Analogy:** Think of a conductor in an orchestra. The conductor doesn't play any instrument, but they tell each section (violins, drums, etc.) when to play and in what order. Our orchestrators tell SAPI services what to do and in what order.

### 7.2 The Main Orchestrators

| Orchestrator | What It Does | When It's Used |
|--------------|--------------|----------------|
| `QuoteOrchestrator` | Generates new quotes | V2 /quote endpoint |
| `CoverageIngestionQuoteOrchestrator` | Generates quotes with coverage matching | V1 /quote endpoint |
| `BindOrchestrator` | Handles policy purchase | /finalize, /validate endpoints |
| `RecallOrchestrator` | Retrieves existing quotes | /recall endpoints |
| `LookUpOrchestrator` | Gets vehicle data | /lookup/* endpoints |

### 7.3 Understanding Quote Flows

**There are different "workflows" depending on what the partner wants:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         QUOTE WORKFLOW TYPES                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. NEW QUOTE (Most Common)                                                  │
│     ───────────────────────                                                  │
│     Partner wants a brand new quote                                          │
│                                                                              │
│     Flow: Init → Save → Quote                                                │
│                                                                              │
│     ┌────────┐      ┌────────┐      ┌────────┐                              │
│     │  Init  │─────▶│  Save  │─────▶│ Quote  │                              │
│     └────────┘      └────────┘      └────────┘                              │
│         │               │               │                                    │
│         ▼               ▼               ▼                                    │
│     Creates new     Saves all the   Calculates                              │
│     session ID      customer data   the price                               │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  2. REQUOTE / RECALL (Modify Existing Quote)                                 │
│     ─────────────────────────────────────────                                │
│     Partner has a previous quote and wants to modify it                      │
│                                                                              │
│     Flow: Recall → Save → Quote                                              │
│                                                                              │
│     ┌────────┐      ┌────────┐      ┌────────┐                              │
│     │ Recall │─────▶│  Save  │─────▶│ Quote  │                              │
│     └────────┘      └────────┘      └────────┘                              │
│         │               │               │                                    │
│         ▼               ▼               ▼                                    │
│     Retrieves       Updates with    Recalculates                            │
│     previous        new data        the price                               │
│     quote data                                                               │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  3. BIND (Purchase Policy)                                                   │
│     ──────────────────────                                                   │
│     Customer wants to actually buy the policy                                │
│                                                                              │
│     Flow: Save → Bind                                                        │
│                                                                              │
│     ┌────────┐      ┌────────┐                                              │
│     │  Save  │─────▶│  Bind  │                                              │
│     └────────┘      └────────┘                                              │
│         │               │                                                    │
│         ▼               ▼                                                    │
│     Save final      Create the                                               │
│     policy data     actual policy                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.4 Reading an Orchestrator (Example)

Let's look at a simplified version of what happens in `CoverageIngestionQuoteOrchestrator`:

```java
// Simplified pseudocode - the actual code is more complex

public class CoverageIngestionQuoteOrchestrator {

    public Response personalAutoCoverageIngestionQuote(Request request, PartnerProperties partner) {

        // STEP 1: Validate the request
        validateRequest(request);
        checkIfRegionAllowed(request.getZipCode(), request.getStateCode(), partner);

        // STEP 2: If partner wants specific coverages, match them to our options
        CoveragePackages matchedCoverages = null;
        if (request.hasCoveragePackages()) {
            List<CoverageRecord> availableCoverages = coveragesDataService.getForState(stateCode);
            matchedCoverages = CoverageMatchUtil.matchCoverages(
                request.getCoveragePackages(),
                availableCoverages
            );
        }

        // STEP 3: Make SAPI calls in sequence
        InitResponse initResp = sapi.init(initRequest);
        checkForErrors(initResp);  // Throw exception if SAPI returned errors

        SaveResponse saveResp = sapi.save(saveRequest);
        checkForErrors(saveResp);

        QuoteResponse quoteResp = sapi.quote(quoteRequest);
        checkForErrors(quoteResp);

        // STEP 4: Transform SAPI response to partner format and return
        return ResponseMapper.toPartnerResponse(quoteResp);
    }
}
```

---

## 8. SAPI: The Backend We Talk To

### 8.1 What is SAPI?

**SAPI (Sales API)** is GEICO's core platform for insurance quoting and policy management. It's maintained by a different team and we treat it as an external service.

**Key points:**
- We never modify SAPI
- We only call its HTTP endpoints
- SAPI responses use complex generated model classes (with very long names!)

### 8.2 How We Call SAPI

All SAPI calls go through `SapiServiceProxy`:

```java
// service/SapiServiceProxy.java

@Service
public class SapiServiceProxy {

    // Each method follows this pattern:
    public InitResponse init(InitRequest request) {

        // 1. Calculate how much time we have left
        Duration remainingTime = RequestCancellationUtil.getRemainingTimeout();

        // 2. Get authentication token (OAuth2)
        String token = acquireMsalToken();

        // 3. Build headers
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.set("X-Correlation-Id", correlationId);  // For tracing

        // 4. Make the HTTP call with timeout
        return webClient
            .post()
            .uri("/api/initialize/")
            .body(request)
            .timeout(remainingTime)  // Don't wait forever!
            .block();  // Wait for response
    }
}
```

### 8.3 SAPI Response Handling

SAPI can return "notices" (messages) in its responses. Some are errors, some are warnings.

```java
// How we handle SAPI responses:

QuoteResponse sapiResponse = sapi.quote(request);

// Extract any error notices from the response
List<Notice> errorNotices = SapiNoticeUtil.getErrorNotices(sapiResponse);

if (!errorNotices.isEmpty()) {
    // SAPI returned errors - we need to tell the partner
    throw new DataValidationException(errorNotices);
}

// If we get here, the response was successful
return transformResponse(sapiResponse);
```

### 8.4 Those Long Class Names

You'll see class names like:
```
GeicoApplicationsBusinessSaaSDomainDtoInterfacesQuoteRequest
```

**Don't be intimidated!** These are auto-generated from SAPI's OpenAPI specification. The pattern is:
- `Geico...` = Namespace
- `...Dto...` = Data Transfer Object
- `...Request/Response` = What type of object

**Tip:** In your IDE, use autocomplete. Type `Quote` and let the IDE find the right class.

---

## 9. Coverage Ingestion: The Smart Matching System

### 9.1 What is Coverage Ingestion?

**The Problem:** Partners send coverage requests like "I want BI coverage with 100/300 limit." But what if GEICO doesn't offer exactly 100/300 in that state?

**The Solution:** Our "Coverage Ingestion" system automatically matches the partner's request to the closest available option.

### 9.2 How Coverage Matching Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    HOW COVERAGE MATCHING WORKS                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PARTNER REQUESTS:                      GEICO OFFERS (for this state):       │
│  ────────────────                       ────────────────────────────          │
│                                                                              │
│  "I want BI 100/300"                    BI options available:                │
│                                           • 25/50                            │
│                                           • 50/100                           │
│                                           • 100/300  ← Exact match!          │
│                                           • 250/500                          │
│                                           • 500/1000                         │
│                                                                              │
│  MATCHING ALGORITHM:                                                         │
│  ───────────────────                                                         │
│                                                                              │
│  Step 1: Try EXACT MATCH                                                     │
│    • Look for an option that matches exactly                                 │
│    • "100/300" == "100/300"? YES! Use it.                                   │
│                                                                              │
│  Step 2: If no exact match, try NEXT HIGHER                                  │
│    • If partner requested "75/150" (not available)                          │
│    • Find the next higher option: "100/300"                                 │
│    • This gives the customer MORE coverage, not less                        │
│                                                                              │
│  Step 3: If nothing higher, use HIGHEST AVAILABLE                            │
│    • If partner requested "1000/3000" (too high)                            │
│    • Use the maximum we offer: "500/1000"                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.3 Different Types of Coverages Need Different Matching

Not all coverages have the same format:

| Coverage Type | Format Example | Matcher Class |
|---------------|----------------|---------------|
| **Two limits** (BI, UMBI) | "100/300" | `TwoLimitNoDeductibleCoverageMatcher` |
| **One limit, no deductible** (PD, MED) | "50000" | `SingleLimitNoDeductibleCoverageMatcher` |
| **No limit, just deductible** (COMP, COLL) | "500" | `NoLimitSingleDeductibleCoverageMatcher` |
| **Limit and deductible** (UMPD in most states) | "25000/500" | `SingleLimitSingleDeductibleCoverageMatcher` |

### 9.4 The Coverage Matching Code

The main logic is in `util/coveragematching/CoverageMatchUtil.java`:

```java
// Simplified flow:

public static CoveragePackages matchCoverages(
        CoveragePackages requestedPackages,
        Map<String, List<CoverageRecord>> availableOptions,
        String stateCode) {

    CoveragePackages result = new CoveragePackages();

    for (CoveragePackage requestedPackage : requestedPackages.getPackages()) {
        for (CoverageSelection requestedCoverage : requestedPackage.getCoverageSelections()) {

            // Get available options for this coverage type (e.g., "BI")
            List<CoverageRecord> options = availableOptions.get(requestedCoverage.getCoverage());

            // Try exact match first
            CoverageRecord matched = tryExactMatch(requestedCoverage, options);

            // If no exact match, try next higher
            if (matched == null) {
                ICoverageMatcher matcher = CoverageMatcherFactory.getMatcher(
                    requestedCoverage.getCoverage(),
                    stateCode
                );
                matched = matcher.matchCoverage(requestedCoverage, options);
            }

            // Add matched coverage to result
            result.add(matched);
        }
    }

    return result;
}
```

---

## 10. Error Handling: What Happens When Things Go Wrong

### 10.1 Types of Errors

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ERROR TYPES AND HTTP CODES                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  HTTP 400 - BAD REQUEST (Partner's fault)                                    │
│  ─────────────────────────────────────────                                   │
│  The partner sent invalid data.                                              │
│                                                                              │
│  Examples:                                                                   │
│    • Missing required field: "firstName is required"                         │
│    • Invalid format: "dateOfBirth must be in YYYY-MM-DD format"             │
│    • Invalid coverage: "Coverage XYZ not available in this state"           │
│                                                                              │
│  Exception: DataValidationException                                          │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  HTTP 422 - UNPROCESSABLE ENTITY (Blocked by policy)                         │
│  ───────────────────────────────────────────────────                         │
│  The request is valid, but we're not allowed to process it.                 │
│                                                                              │
│  Examples:                                                                   │
│    • State blocked: "Due to weather restrictions, FL is temporarily blocked"│
│    • Partner blocked: "This partner is currently disabled"                  │
│                                                                              │
│  Exception: BlockedRequestException                                          │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  HTTP 500 - INTERNAL SERVER ERROR (Our fault)                                │
│  ─────────────────────────────────────────────                               │
│  Something went wrong on our side.                                           │
│                                                                              │
│  Examples:                                                                   │
│    • Unexpected exception                                                    │
│    • Configuration error                                                     │
│                                                                              │
│  Exception: PersonalAutoOrchestratorException, SapiUpstreamException        │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  HTTP 504 - GATEWAY TIMEOUT (SAPI too slow)                                  │
│  ──────────────────────────────────────────                                  │
│  We didn't get a response from SAPI in time.                                │
│                                                                              │
│  Examples:                                                                   │
│    • SAPI is overloaded                                                     │
│    • Network issues                                                          │
│                                                                              │
│  Exception: WebClientRequestException, CancellationException                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 The Global Exception Handler

All errors are caught and formatted by `GlobalExceptionHandler`:

```java
// exception/GlobalExceptionHandler.java

@ControllerAdvice  // This applies to all controllers
public class GlobalExceptionHandler {

    // Handle validation errors → 400
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidationError(Exception ex) {
        return ResponseEntity
            .status(400)
            .body(formatErrorResponse(ex));
    }

    // Handle blocked requests → 422
    @ExceptionHandler(BlockedRequestException.class)
    public ResponseEntity<ErrorResponse> handleBlockedRequest(Exception ex) {
        return ResponseEntity
            .status(422)
            .body(formatErrorResponse(ex));
    }

    // Handle timeouts → 504
    @ExceptionHandler(WebClientRequestException.class)
    public ResponseEntity<ErrorResponse> handleTimeout(Exception ex) {
        return ResponseEntity
            .status(504)
            .body(formatErrorResponse(ex));
    }

    // Catch-all for unexpected errors → 500
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleEverythingElse(Exception ex) {
        log.error("Unexpected error", ex);  // Log it!
        return ResponseEntity
            .status(500)
            .body(formatErrorResponse(ex));
    }
}
```

### 10.3 Error Response Format

All errors return a consistent JSON format:

```json
{
  "statusCode": 400,
  "errors": [
    {
      "code": "invalid_data",
      "message": "Invalid data provided.",
      "details": {
        "field": "operators[0].dateOfBirth",
        "reason": "Date of birth is required"
      }
    }
  ]
}
```

---

## 11. Feature Flags: Emergency Controls

### 11.1 What Are Feature Flags?

Feature flags are "on/off switches" that let us control system behavior without deploying new code.

**Use case:** A hurricane is hitting Florida. We need to stop all Florida quotes immediately!

Without feature flags: Deploy code change, wait for CI/CD, hope nothing breaks.
With feature flags: Change one configuration value, immediately effective.

### 11.2 Our Feature Flags

| Flag Name | Purpose |
|-----------|---------|
| `EMERGENCY_BLOCK_BY_STATE` | Block all quotes for specific states |
| `EMERGENCY_BLOCK_BY_ZIP` | Block all quotes for specific zip codes |
| `PARTNER_DISABLED` | Disable specific partners entirely |

### 11.3 How Feature Flags Work

```yaml
# Configuration in application.yml:

featureFlags:
  EMERGENCY_BLOCK_BY_STATE:
    enabled: true
    filters: ["FL", "TX"]  # Block these states

  EMERGENCY_BLOCK_BY_ZIP:
    enabled: true
    filters: ["33101", "33102"]  # Block these zip codes

  PARTNER_DISABLED:
    enabled: true
    filters: ["PROBLEM_PARTNER"]  # Disable this partner
```

```java
// In code (ZipStateCodeUtil.java):

if (featureFlagConfig.isFeatureEnabled(EMERGENCY_BLOCK_BY_STATE, stateCode)) {
    throw new BlockedRequestException(
        "Due to weather related coverage restrictions, " +
        "active binding restrictions are currently in effect"
    );
}
```

---

## 12. Metrics and Logging: How We Monitor Things

### 12.1 Logging Basics

Every log message automatically includes:
- **Timestamp:** When it happened
- **Correlation ID:** Request tracking number
- **Partner ID:** Who made the request
- **Log level:** INFO, WARN, ERROR, etc.

**Example log output:**
```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "level": "INFO",
  "X-Correlation-Id": "abc-123-def-456",
  "partnerId": "AMAZON",
  "message": "Processing quote request",
  "class": "CoverageIngestionQuoteOrchestrator"
}
```

### 12.2 Metrics

We track metrics that help us understand system health:

| Metric | What It Measures |
|--------|------------------|
| `http_server_requests_seconds` | How long requests take |
| Request counts by status code | How many 200s, 400s, 500s |
| Coverage ingestion counts | How many coverage matching requests |

**Where to see metrics:** `/actuator/prometheus` endpoint

### 12.3 Useful Logging Tips

```java
// GOOD: Include context
log.info("Processing quote for state: {}, partner: {}", stateCode, partnerId);

// GOOD: Log at appropriate levels
log.debug("Detailed info for debugging");  // Only shows in debug mode
log.info("Normal business events");         // Shows in production
log.warn("Something concerning");           // Pay attention
log.error("Something broke", exception);    // Needs immediate attention

// BAD: Don't log sensitive data!
log.info("SSN: " + customer.getSsn());  // NEVER do this!
```

---

## 13. Common Tasks for New Engineers

### 13.1 "I Need to Add a New Partner"

1. **Get the partner's Azure AD OID** (their unique identifier)

2. **Add to partner-configuration.yml:**
   ```yaml
   partnerOidsToConfigurations:
     "new-partner-oid-here": "NEW_PARTNER_NAME"
   ```

3. **Add partner-specific settings if needed:**
   ```yaml
   partnerConfigurations:
     NEW_PARTNER_NAME:
       blocked:
         states: []  # States where they can't quote
         zipCodes: []
   ```

### 13.2 "I Need to Block a State Temporarily"

**Option 1: Feature Flag (Preferred for emergencies)**
```yaml
featureFlags:
  EMERGENCY_BLOCK_BY_STATE:
    enabled: true
    filters: ["FL"]  # Add the state code
```

**Option 2: Partner-Specific Block**
```yaml
partnerConfigurations:
  AMAZON:
    blocked:
      states: ["FL"]
```

### 13.3 "I Need to Debug a Failed Request"

1. **Get the X-Correlation-Id** from the error response or logs

2. **Search logs for that ID:**
   ```
   Search: "X-Correlation-Id": "the-id-here"
   ```

3. **Follow the request through:**
   - Filter entry (authentication)
   - Controller (validation)
   - Orchestrator (SAPI calls)
   - Error point

### 13.4 "I Need to Add a New Coverage Type"

1. **Add to coverage constants:**
   ```java
   // constant/CoverageConstants.java
   public static final String NEW_COVERAGE = "NC";
   ```

2. **Add matcher in factory:**
   ```java
   // util/coveragematching/coveragematchers/CoverageMatcherFactory.java
   COVERAGE_MATCHER_MAP.put("NC", SINGLE_LIMIT_NO_DEDUCTIBLE_MATCHER);
   ```

3. **Add to coverage data YAML:**
   ```yaml
   # coverageingestion/available-coverages.yml
   NC:
     - limit: "10000"
     - limit: "25000"
   ```

---

## 14. Glossary: All the Terms Explained

| Term | What It Means |
|------|---------------|
| **PPMXPO** | PPM-ExchangeOrchestrator (this system) |
| **SAPI** | Sales API - GEICO's backend quote/bind system |
| **Partner** | External company (Amazon, Insurify, etc.) that uses our API |
| **OID** | Object ID - unique identifier for a partner in Azure AD |
| **JWT** | JSON Web Token - the authentication token partners send us |
| **MDC** | Mapped Diagnostic Context - thread-local logging data |
| **Orchestrator** | Class that coordinates multiple SAPI calls |
| **Coverage Ingestion** | Feature that matches partner coverages to GEICO options |
| **Feature Flag** | Configuration switch to enable/disable features |
| **Correlation ID** | Unique ID for tracking a request through logs |
| **Init** | SAPI call to start a new quote session |
| **Save** | SAPI call to store customer/vehicle data |
| **Quote** | SAPI call to calculate premium price |
| **Recall** | SAPI call to retrieve an existing quote |
| **Bind** | SAPI call to purchase a policy |
| **BI** | Bodily Injury coverage |
| **PD** | Property Damage coverage |
| **COMP** | Comprehensive coverage |
| **COLL** | Collision coverage |
| **Mnemonic** | Short code for a coverage type (BI, PD, COMP, etc.) |

---

## 15. FAQ: Questions New Engineers Often Ask

### Q: Why do we have V1 and V2 APIs?

**A:** V1 was the original API with all features including coverage ingestion. V2 is a simplified API for partners who don't need coverage matching. We maintain both for backward compatibility.

### Q: Why are the SAPI class names so long?

**A:** They're auto-generated from SAPI's OpenAPI specification. The long names are namespaced to avoid conflicts. Use your IDE's autocomplete!

### Q: Why do we make 3 SAPI calls (Init → Save → Quote) instead of 1?

**A:** SAPI was designed for GEICO's internal step-by-step form flow. Each step serves a purpose. We could ask SAPI team for a single combined endpoint, but the current approach works and changing SAPI is complex.

### Q: What happens if SAPI is down?

**A:** Partners will get HTTP 504 (timeout) or 500 errors. We have alerts for this. The partner should retry with exponential backoff.

### Q: How do I test my changes locally?

**A:** Run the application with the `local` profile. You'll need to set up SAPI connectivity (see team documentation) or use mocks.

### Q: What's the difference between an error and a notice?

**A:** SAPI returns "notices" which can be informational warnings or actual errors. We filter for notices with severity "Error" or "Fatal" to determine if something actually failed.

### Q: Why do we cache lookup data?

**A:** Vehicle makes/models don't change often, but looking them up from SAPI is slow. Caching reduces latency and SAPI load.

### Q: What's the timeout for requests?

**A:** Default is 30 seconds. If SAPI doesn't respond in time, we return 504 to the partner.

---

## You're Ready!

You now have a solid foundation for understanding this codebase. Here's what to do next:

1. **Set up your local environment** (see team wiki)
2. **Pick a small bug or task** to get familiar with the code
3. **Trace a request through the system** using logs
4. **Ask questions!** No question is too basic

Welcome to the team!
