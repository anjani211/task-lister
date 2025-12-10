# Coverage Ingestion System: Complete Code Walkthrough

**A step-by-step guide through every line of code that makes coverage ingestion work**

---

## Table of Contents

1. [Introduction: What We're About to Explore](#1-introduction-what-were-about-to-explore)
2. [The Entry Point: Where It All Begins](#2-the-entry-point-where-it-all-begins)
3. [The Orchestrator: The Brain of Coverage Ingestion](#3-the-orchestrator-the-brain-of-coverage-ingestion)
4. [Loading Available Coverages: The Data Foundation](#4-loading-available-coverages-the-data-foundation)
5. [The Matching Engine: Where Magic Happens](#5-the-matching-engine-where-magic-happens)
6. [The Four Matchers: Each Coverage Type Explained](#6-the-four-matchers-each-coverage-type-explained)
7. [The Factory Pattern: Choosing the Right Matcher](#7-the-factory-pattern-choosing-the-right-matcher)
8. [SAPI Integration: Sending to the Backend](#8-sapi-integration-sending-to-the-backend)
9. [Response Mapping: Completing the Circle](#9-response-mapping-completing-the-circle)
10. [Complete Flow Diagram: Putting It All Together](#10-complete-flow-diagram-putting-it-all-together)
11. [Code Reference Quick Guide](#11-code-reference-quick-guide)

---

## 1. Introduction: What We're About to Explore

This document walks you through the **actual code execution** of the coverage ingestion system. We'll trace a request from the moment it enters the system to when the response goes back to the partner.

### What is Coverage Ingestion?

When a partner sends a quote request, they can optionally include **custom coverage packages** - specific coverages they want quoted (like "BI at 100/300" or "COMP with $500 deductible").

**The Problem:** Partners might request coverages that GEICO doesn't offer exactly (e.g., "BI at 75/150" when we only offer 50/100 or 100/300).

**The Solution:** Our coverage ingestion system:
1. Loads all available coverages for the customer's state
2. Matches each requested coverage to the closest available option
3. Sends the matched coverages to SAPI for quoting
4. Returns quotes for all coverage packages

### The Key Files We'll Explore

| File | Purpose |
|------|---------|
| `V1Controller.java` | Entry point - receives HTTP request |
| `CoverageIngestionQuoteOrchestrator.java` | Coordinates the entire flow |
| `CoveragesDataService.java` | Loads available coverage data |
| `CoverageMatchUtil.java` | Main matching logic |
| `CoverageMatcherFactory.java` | Selects appropriate matcher |
| `*CoverageMatcher.java` (4 files) | Specific matching algorithms |
| `SapiServiceProxy.java` | Sends requests to SAPI |

---

## 2. The Entry Point: Where It All Begins

### File: `controller/V1Controller.java`

When a partner sends a POST request to `/v1/personal/auto/quote`, execution starts here:

```java
// V1Controller.java - Lines 122-135

@PostMapping("/quote")
public ResponseEntity<PersonalAutoQuoteCoverageIngestionResponse> postQuote(
    @Valid @RequestBody PersonalAutoQuoteCoverageIngestionRequest request,
    HttpServletRequest httpServletRequest) {

    // Step 1: Get partner properties from the authenticated request
    PartnerProperties partnerProperties =
        partnerConfig.getPartnerProperties(MDC.get(Common.PARTNER_ID));

    // Step 2: Call the orchestrator (isRecall = false for new quotes)
    PersonalAutoQuoteCoverageIngestionResponse response =
        coverageIngestionQuoteOrchestrator.personalAutoCoverageIngestionQuote(
            request,
            partnerProperties,
            false  // isRecall = false means this is a NEW quote
        );

    // Step 3: Return the response
    return ResponseEntity.ok(response);
}
```

**What happens here:**
1. Spring validates the request body (`@Valid` annotation)
2. We get the partner's configuration (blocked states, features, etc.)
3. We delegate to the orchestrator
4. We return the response

**The Request Object Structure:**
```json
{
  "salesContext": {
    "mailingAddress": {
      "stateCode": "TX",
      "postalCode": "75001"
    },
    "operators": [...],
    "autos": [...]
  },
  "coveragePackages": {
    "packages": [
      {
        "partnerPackageName": "Premium",
        "coverageSelections": [
          { "coverage": "BI", "limit": "100/300", "deductible": "0000" },
          { "coverage": "COMP", "limit": "000000", "deductible": "500", "autoId": "auto-1" }
        ]
      }
    ]
  }
}
```

---

## 3. The Orchestrator: The Brain of Coverage Ingestion

### File: `orchestrator/CoverageIngestionQuoteOrchestrator.java`

This is where all the coordination happens. Let's walk through it step by step.

### Step 3.1: Entry Validation

```java
// CoverageIngestionQuoteOrchestrator.java - Lines 54-77

@SneakyThrows
public PersonalAutoQuoteCoverageIngestionResponse personalAutoCoverageIngestionQuote(
    PersonalAutoQuoteCoverageIngestionRequest legacyRequest,
    PartnerProperties partnerProperties,
    boolean isRecall) {

    // VALIDATION 1: Check for null request
    if (legacyRequest == null || legacyRequest.getSalesContext() == null) {
        throw new IllegalArgumentException("Request or SalesContext is null");
    }

    // VALIDATION 2: Recall requires a recallKey
    if (isRecall && legacyRequest.getRecallKey() == null) {
        throw new IllegalArgumentException("Missing recallKey");
    }

    // VALIDATION 3: Must have mailing address
    if (legacyRequest.getSalesContext().getMailingAddress() == null) {
        throw new IllegalArgumentException("mailingAddress is null");
    }

    // VALIDATION 4: Check if this state/zip is allowed for this partner
    ZipStateCodeUtil.isRegionAllowed(
        legacyRequest.getSalesContext().getMailingAddress().getPostalCode(),
        legacyRequest.getSalesContext().getMailingAddress().getStateCode(),
        partnerProperties,
        featureFlagConfig);

    // If all validations pass, continue to the main handler
    return coverageIngestionQuoteRecallHandler(legacyRequest, partnerProperties, isRecall);
}
```

**What `ZipStateCodeUtil.isRegionAllowed()` checks:**
1. Is the zip code format valid?
2. Does the zip code match the state?
3. Is there an emergency state block (feature flag)?
4. Is there an emergency zip block (feature flag)?
5. Is this state blocked for this specific partner?

If any check fails → `BlockedRequestException` → HTTP 422

### Step 3.2: Coverage Matching (The Heart of It)

```java
// CoverageIngestionQuoteOrchestrator.java - Lines 79-127

private PersonalAutoQuoteCoverageIngestionResponse coverageIngestionQuoteRecallHandler(
    PersonalAutoQuoteCoverageIngestionRequest legacyRequest,
    PartnerProperties partnerProperties,
    boolean isRecall) {

    // Convert request to internal format
    SapiBaseRequest sapiBaseRequest = getSapiBaseRequest(legacyRequest, partnerProperties);

    // Extract tracking ID and state code
    String partnerTrackingId = /* ... extract from request ... */;
    String requestStateCode = legacyRequest.getSalesContext()
        .getMailingAddress().getStateCode();

    // Set state for error metrics
    CoverageIngestionErrorMetricUtil.setStateForMetrics(requestStateCode);

    // ╔══════════════════════════════════════════════════════════════════╗
    // ║  THIS IS WHERE COVERAGE MATCHING HAPPENS                         ║
    // ╚══════════════════════════════════════════════════════════════════╝
    CoveragePackages coveragePackages = null;

    // Only do matching if partner sent coverage packages
    if (legacyRequest.getCoveragePackages() != null
        && legacyRequest.getCoveragePackages().getPackages() != null
        && !legacyRequest.getCoveragePackages().getPackages().isEmpty()) {

        // Record metric: we're doing coverage ingestion
        CoverageIngestionMetricUtil.markAsCoverageIngestion(
            legacyRequest.getCoveragePackages().getPackages().size());

        // THE KEY CALL: Match requested coverages to available options
        coveragePackages = CoverageMatchUtil.matchCoverages(
            legacyRequest.getCoveragePackages(),           // What partner requested
            coveragesDataService
                .getAvailableStateCoverageData(requestStateCode, "mailingAddress.stateCode")
                .getCoverages(),                           // What's available for this state
            requestStateCode);                             // State code for state-specific rules
    }

    // Now call SAPI with the matched coverages
    GeicoApplicationsBusinessSaaSDomainDtoInterfacesQuoteResponse coverageQuoteResponse =
        processSapiCoverageIngestionQuoteOrRecall(
            sapiBaseRequest, coveragePackages, partnerProperties, isRecall);

    // Map SAPI response to partner response format
    return CoverageIngestionResponseMapper.toLegacyPersonalAutoQuoteWithCoverageIngestionResponse(
        coverageQuoteResponse,
        legacyRequest,
        partnerTrackingId,
        requestStateCode,
        featureFlagConfig);
}
```

**Key insight:** The orchestrator does THREE things:
1. **Load** available coverages for the state
2. **Match** requested coverages to available options
3. **Send** to SAPI and map the response

---

## 4. Loading Available Coverages: The Data Foundation

### File: `service/CoveragesDataService.java`

Before we can match coverages, we need to know what's available. This service loads coverage data from YAML configuration.

```java
// CoveragesDataService.java - Lines 33-62

public StateCoverages getAvailableStateCoverageData(String state, String sourceProperty) {

    // ERROR: State is missing
    if (StringUtils.isBlank(state)) {
        throw new PersonalAutoOrchestratorException(
            String.format(
                "State is missing from %s, cannot retrieve available state coverage data.",
                sourceProperty),
            /* error response */);
    }

    // ERROR: State not in our data
    else if (!availableCoverages.getStates().containsKey(state)) {
        throw new PersonalAutoOrchestratorException(
            String.format(
                "State: %s coverage data from source: %s is not currently available.",
                state, sourceProperty),
            /* error response */);
    }

    // SUCCESS: Return state's coverage data
    return getData(state, null).getStates().get(state);
}
```

**Where does `availableCoverages` come from?**

It's loaded at application startup from `available-coverages.yml`:

```yaml
# src/main/resources/coverageingestion/available-coverages.yml

availableCoverages:
  TX:  # Texas
    BI:  # Bodily Injury
      - coverage: BI
        coverageLongDescription: Bodily Injury
        limit: 30/60
        limitLongDescription: $30,000/$60,000
        deductible: OMIT FIELD
        deductibleLongDescription: No deductible
      - coverage: BI
        limit: 50/100
        # ... more BI options
      - coverage: BI
        limit: 100/300
        # ...
    COMP:  # Comprehensive
      - coverage: COMP
        limit: OMIT FIELD
        deductible: 250
      - coverage: COMP
        limit: OMIT FIELD
        deductible: 500
      # ... more COMP options
```

**Data Structure in Memory:**
```
availableCoverages
└── states (Map<String, StateCoverages>)
    ├── "TX" → StateCoverages
    │   └── coverages (Map<String, List<CoverageRecord>>)
    │       ├── "BI" → [CoverageRecord, CoverageRecord, ...]
    │       ├── "COMP" → [CoverageRecord, CoverageRecord, ...]
    │       └── ...
    ├── "CA" → StateCoverages
    │   └── ...
    └── ...
```

---

## 5. The Matching Engine: Where Magic Happens

### File: `util/coveragematching/CoverageMatchUtil.java`

This is the core algorithm. Let's trace through it with a real example.

### Example Scenario

**Partner requests:**
```json
{
  "packages": [{
    "partnerPackageName": "Basic",
    "coverageSelections": [
      { "coverage": "BI", "limit": "75/150", "deductible": "0000" },
      { "coverage": "COMP", "limit": "000000", "deductible": "300" }
    ]
  }]
}
```

**Available in Texas:**
- BI: 30/60, 50/100, 100/300, 250/500
- COMP: 100, 250, 500, 1000

**Expected result:**
- BI 75/150 → matched to 100/300 (next higher)
- COMP 300 → matched to 500 (next higher deductible)

### Step 5.1: Main Entry Point

```java
// CoverageMatchUtil.java - Lines 178-203

public static CoveragePackages matchCoverages(
    CoveragePackages requestedCoveragePackages,
    Map<String, List<CoverageRecord>> actualCoverageOptions,
    String requestedStateCode) {

    // GUARD: No available coverages at all?
    if (actualCoverageOptions == null || actualCoverageOptions.isEmpty()) {
        throw new DataValidationException(
            NO_AVAILABLE_COVERAGES,
            /* error response */);
    }

    // Create response container
    CoveragePackages response = new CoveragePackages(new ArrayList<>());

    // Process each package
    for (CoveragePackage requestedPackage : requestedCoveragePackages.getPackages()) {
        response.getPackages().add(
            matchPackageCoverages(requestedPackage, actualCoverageOptions, requestedStateCode)
        );
    }

    return response;
}
```

### Step 5.2: Match Each Package

```java
// CoverageMatchUtil.java - Lines 249-265

private static CoveragePackage matchPackageCoverages(
    CoveragePackage requestedPackage,
    Map<String, List<CoverageRecord>> actualCoverageOptions,
    String requestedStateCode) {

    // Create response package with same name
    CoveragePackage response = new CoveragePackage(
        requestedPackage.getPartnerPackageName(),  // "Basic"
        new ArrayList<>());

    // Empty package? Return empty.
    if (requestedPackage.getCoverageSelections().isEmpty()) return response;

    // Match each coverage in the package
    for (CoverageSelection requestedCoverage : requestedPackage.getCoverageSelections()) {
        evaluateCoverageMatchByMode(
            requestedCoverage,
            actualCoverageOptions,
            response,
            requestedStateCode);
    }

    return response;
}
```

### Step 5.3: Evaluate Each Coverage (The Decision Point)

```java
// CoverageMatchUtil.java - Lines 267-373

private static void evaluateCoverageMatchByMode(
    CoverageSelection requestedCoverage,       // e.g., BI 75/150
    Map<String, List<CoverageRecord>> actualCoverageOptions,
    CoveragePackage matchedPackageResponse,
    String requestedStateCode) {

    // Get available options for this coverage type
    List<CoverageRecord> availableCoverageOptions =
        actualCoverageOptions.getOrDefault(
            requestedCoverage.getCoverage().toUpperCase(),  // "BI"
            null);

    // ERROR: Coverage type doesn't exist for this state
    if (availableCoverageOptions == null || availableCoverageOptions.isEmpty()) {
        throw new DataValidationException(
            String.format(COVERAGE_MATCH_ERROR_MESSAGE,
                matchedPackageResponse.getPartnerPackageName(),  // "Basic"
                requestedCoverage.getCoverage(),                 // "BI"
                NO_AVAILABLE_COVERAGES),
            /* error response */);
    }

    CoverageRecord matchedCoverageLimitDeductible;

    // CASE 1: Only one option available → use it
    if (availableCoverageOptions.size() == 1) {
        matchedCoverageLimitDeductible = availableCoverageOptions.get(0);
        log.info("Only found one available coverage for coverage {} in package {}",
            requestedCoverage.getCoverage(),
            matchedPackageResponse.getPartnerPackageName());

    // CASE 2: Multiple options → need to match
    } else {

        // ATTEMPT 1: Try exact match first
        matchedCoverageLimitDeductible = tryMatchToExactCoverage(
            requestedCoverage,
            matchedPackageResponse.getPartnerPackageName(),
            availableCoverageOptions);

        // ATTEMPT 2: If no exact match, try next higher
        if (matchedCoverageLimitDeductible == null) {
            matchedCoverageLimitDeductible = tryMatchToNextHigherCoverage(
                requestedCoverage,
                matchedPackageResponse.getPartnerPackageName(),
                availableCoverageOptions,
                requestedStateCode);
        }
    }

    // ERROR: No match found at all
    if (matchedCoverageLimitDeductible == null) {
        String errorMessage = String.format(COVERAGE_MATCH_ERROR_MESSAGE,
            matchedPackageResponse.getPartnerPackageName(),
            requestedCoverage.getCoverage(),
            "Available Coverage Selection Not Found...");
        throw new DataValidationException(errorMessage, /* error response */);
    }

    // SUCCESS: Add matched coverage to response
    log.debug("Package {}, Requested Coverage {} (Limit: {}, Deductible {}) " +
              "Matched to Coverage: {} (Limit: {}, Deductible {})",
        matchedPackageResponse.getPartnerPackageName(),
        requestedCoverage.getCoverage(),
        requestedCoverage.getLimit(),
        requestedCoverage.getDeductible(),
        matchedCoverageLimitDeductible.getCoverage(),
        matchedCoverageLimitDeductible.getLimit(),
        matchedCoverageLimitDeductible.getDeductible());

    // Build the matched selection
    matchedPackageResponse.getCoverageSelections().add(
        new CoverageSelection(
            matchedCoverageLimitDeductible.getCoverage(),
            /* processed limit */,
            /* processed deductible */,
            /* autoId if vehicle coverage */,
            /* combined limit/deductible string */));
}
```

### Step 5.4: Exact Match Attempt

```java
// CoverageMatchUtil.java - Lines 375-418

private static CoverageRecord tryMatchToExactCoverage(
    CoverageSelection requestedCoverage,    // BI 75/150
    String packageId,                        // "Basic"
    List<CoverageRecord> availableSapiCoverages) {

    // Build the string to match against: "75/150"
    String limitDeductibleStringToExactMatchOn =
        getLimitDeductibleStringFromCoverageSelectionToExactMatchOn(requestedCoverage);

    if (StringUtils.isEmpty(limitDeductibleStringToExactMatchOn)) {
        log.info("Exact Coverage Match Not Found for Coverage {} " +
                 "because limit and deductible are empty, in Package {}",
            requestedCoverage.getCoverage(), packageId);
        return null;
    }

    // Search for exact match
    CoverageRecord exactMatch = availableSapiCoverages.stream()
        .filter(coverageRecord -> {
            if (StringUtils.isBlank(coverageRecord.getLimit())
                || StringUtils.isBlank(coverageRecord.getDeductible())) {
                return false;
            }

            // Compare: "75/150" vs each available option
            return getLimitDeductibleStringFromCoverageRecordToExactMatchAgainst(coverageRecord)
                .trim()
                .replace(EXCEL_NUMBER_BLANK_SPACE_REGEX, StringUtils.EMPTY)
                .equalsIgnoreCase(limitDeductibleStringToExactMatchOn);
        })
        .findFirst()
        .orElse(null);

    if (exactMatch == null) {
        log.info("Exact Coverage Match Not Found for Coverage {} " +
                 "with limit & deductible: {} in Package {}.",
            requestedCoverage.getCoverage(),
            limitDeductibleStringToExactMatchOn,
            packageId);
    }

    return exactMatch;
}
```

**For BI 75/150:** Exact match fails because we don't have 75/150 in our options.

### Step 5.5: Next Higher Match Attempt

```java
// CoverageMatchUtil.java - Lines 452-481

private static CoverageRecord tryMatchToNextHigherCoverage(
    CoverageSelection requestedCoverage,      // BI 75/150
    String partnerPackageName,                 // "Basic"
    List<CoverageRecord> availableSapiCoverages,
    String requestedStateCode) {               // "TX"

    // Get the appropriate matcher for this coverage type
    // This is where the Factory Pattern comes in
    ICoverageMatcher matcher = CoverageMatcherFactory.getMatcher(
        requestedCoverage.getCoverage(),  // "BI"
        requestedStateCode);               // "TX"

    if (matcher == null) {
        log.info(String.format(COVERAGE_MATCH_ERROR_MESSAGE,
            partnerPackageName,
            requestedCoverage.getCoverage(),
            "Coverage Matcher Not Implemented for Coverage"));
        return null;
    }

    try {
        // Delegate to the specific matcher
        return matcher.matchCoverage(requestedCoverage, availableSapiCoverages);
    } catch (Exception ex) {
        log.error(String.format(COVERAGE_MATCH_ERROR_MESSAGE,
            partnerPackageName,
            requestedCoverage.getCoverage(),
            "Error Matching Closest Coverage: %s".formatted(ex.toString())));
        return null;
    }
}
```

---

## 6. The Four Matchers: Each Coverage Type Explained

### Overview of Matcher Types

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COVERAGE FORMAT TYPES                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. TWO LIMITS, NO DEDUCTIBLE                                                │
│     Format: "100/300" (per person / per accident)                           │
│     Examples: BI, UMBI                                                       │
│     Matcher: TwoLimitNoDeductibleCoverageMatcher                            │
│                                                                              │
│  2. SINGLE LIMIT, NO DEDUCTIBLE                                              │
│     Format: "50000" or "50M"                                                 │
│     Examples: PD, MED, PIP, RR, UIM                                          │
│     Matcher: SingleLimitNoDeductibleCoverageMatcher                         │
│                                                                              │
│  3. NO LIMIT, SINGLE DEDUCTIBLE                                              │
│     Format: "500" (deductible only)                                          │
│     Examples: COMP, COLL                                                     │
│     Matcher: NoLimitSingleDeductibleCoverageMatcher                         │
│                                                                              │
│  4. SINGLE LIMIT + SINGLE DEDUCTIBLE                                         │
│     Format: "25000/500" (limit/deductible)                                   │
│     Examples: UMPD (in most states)                                          │
│     Matcher: SingleLimitSingleDeductibleCoverageMatcher                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Matcher 1: TwoLimitNoDeductibleCoverageMatcher

**File:** `coveragematchers/TwoLimitNoDeductibleCoverageMatcher.java`

**Used for:** BI (Bodily Injury), UMBI (Uninsured Motorist BI)

**Format:** "100/300" means $100,000 per person / $300,000 per accident

```java
// TwoLimitNoDeductibleCoverageMatcher.java - Full Algorithm

@Override
public CoverageRecord matchCoverage(
    CoverageSelection requestedCoverage,    // BI 75/150
    List<CoverageRecord> validCoverages) {  // [30/60, 50/100, 100/300, 250/500]

    // GUARD: No valid coverages
    if (CollectionUtils.isEmpty(validCoverages)) {
        throw new DataValidationException(NO_VALID_COVERAGES_FOR_MATCHING, ...);
    }

    // Check if user wants to REJECT this coverage
    boolean isRequestedCoverageRejected =
        REJ_STRING.equalsIgnoreCase(requestedCoverage.getLimit());

    // Parse the requested limits: "75/150" → [75000, 150000]
    double[] parsedInputLimits = isRequestedCoverageRejected
        ? new double[] {0, 0}
        : parseTwoDoubleValuesFromShortLimitDescription(requestedCoverage.getLimit());

    // Look for REJ option in available coverages
    Optional<CoverageRecord> rejCovRecordOpt = validCoverages.stream()
        .filter(cov -> cov.getLimit().contains(REJ_STRING))
        .findFirst();

    // CASE 1: User wants to reject, and REJ option exists → return REJ
    if (isRequestedCoverageRejected && rejCovRecordOpt.isPresent()) {
        return rejCovRecordOpt.get();
    }

    // Sort valid coverages ascending (excluding REJ)
    // [30/60, 50/100, 100/300, 250/500] → sorted by first limit, then second
    List<CoverageRecord> sortedNonRejValidCoverageList =
        sortNonRejectedValidCoveragesAsc(validCoverages);

    // CASE 2: User wants to reject, but no REJ option → return smallest
    if (isRequestedCoverageRejected) {
        return sortedNonRejValidCoverageList.isEmpty()
            ? null
            : sortedNonRejValidCoverageList.get(0);
    }

    // CASE 3: Find first option where BOTH limits >= requested
    // Looking for coverage where limit[0] >= 75000 AND limit[1] >= 150000
    for (CoverageRecord validCoverage : sortedNonRejValidCoverageList) {
        double[] validLimits = parseTwoDoubleValuesFromShortLimitDescription(
            validCoverage.getLimit());

        // isValidCoverageHigherThanRequested checks ALL values are >=
        if (isValidCoverageHigherThanRequested(validLimits, parsedInputLimits)) {
            return validCoverage;  // FOUND: 100/300 >= 75/150 ✓
        }
    }

    // CASE 4: Nothing higher found → return highest available
    return sortedNonRejValidCoverageList.isEmpty()
        ? null
        : sortedNonRejValidCoverageList.get(sortedNonRejValidCoverageList.size() - 1);
}
```

**Walkthrough for BI 75/150:**
1. Parse "75/150" → [75000, 150000]
2. Sort available: [30/60, 50/100, 100/300, 250/500]
3. Check 30/60 → [30000, 60000] - 30000 < 75000 → SKIP
4. Check 50/100 → [50000, 100000] - 50000 < 75000 → SKIP
5. Check 100/300 → [100000, 300000] - 100000 >= 75000 AND 300000 >= 150000 → MATCH!
6. Return 100/300

### Matcher 2: NoLimitSingleDeductibleCoverageMatcher

**File:** `coveragematchers/NoLimitSingleDeductibleCoverageMatcher.java`

**Used for:** COMP (Comprehensive), COLL (Collision)

**Format:** "500" means $500 deductible (no limit - coverage pays actual cash value)

```java
// NoLimitSingleDeductibleCoverageMatcher.java - Key Logic

@Override
public CoverageRecord matchCoverage(
    CoverageSelection requestedCoverage,    // COMP deductible: 300
    List<CoverageRecord> validCoverages) {  // [100, 250, 500, 1000]

    // Parse requested deductible: "300" → 300.0
    double parsedInputDeductible =
        parseDoubleValueFromShortDescription(requestedCoverage.getDeductible());

    // Sort by deductible ascending: [100, 250, 500, 1000]
    List<CoverageRecord> sortedNonRejValidCoverageList =
        sortNonRejectedValidCoveragesAsc(validCoverages);

    // Find first deductible >= requested
    for (CoverageRecord validCoverage : sortedNonRejValidCoverageList) {
        double validDeductible =
            parseDoubleValueFromShortDescription(validCoverage.getDeductible());

        if (isValidCoverageHigherThanRequested(validDeductible, parsedInputDeductible)) {
            return validCoverage;
        }
    }

    // If nothing higher, return highest
    return sortedNonRejValidCoverageList.get(sortedNonRejValidCoverageList.size() - 1);
}
```

**Walkthrough for COMP deductible 300:**
1. Parse "300" → 300.0
2. Sort available: [100, 250, 500, 1000]
3. Check 100 → 100 < 300 → SKIP
4. Check 250 → 250 < 300 → SKIP
5. Check 500 → 500 >= 300 → MATCH!
6. Return deductible 500

### Matcher 3: SingleLimitNoDeductibleCoverageMatcher

**File:** `coveragematchers/SingleLimitNoDeductibleCoverageMatcher.java`

**Used for:** PD (Property Damage), MED (Medical), PIP, RR, UIM

**Format:** "50000" or "50M" means $50,000 limit

```java
// Algorithm is same as NoLimitSingleDeductibleCoverageMatcher
// but operates on LIMIT field instead of DEDUCTIBLE

// Find first limit >= requested limit
for (CoverageRecord validCoverage : sortedList) {
    if (isValidCoverageHigherThanRequested(
        parseDoubleValueFromShortDescription(validCoverage.getLimit()),
        parsedInputLimit)) {
        return validCoverage;
    }
}
```

### Matcher 4: SingleLimitSingleDeductibleCoverageMatcher

**File:** `coveragematchers/SingleLimitSingleDeductibleCoverageMatcher.java`

**Used for:** UMPD in most states

**Format:** "25000/500" means $25,000 limit with $500 deductible

```java
// SingleLimitSingleDeductibleCoverageMatcher.java - Key Logic

@Override
public CoverageRecord matchCoverage(
    CoverageSelection requestedCoverage,    // UMPD 20000/250
    List<CoverageRecord> validCoverages) {  // [15000/200, 25000/250, 50000/500]

    // Parse both values: [20000, 250]
    double[] parsedInputLimitAndDeductible = new double[] {
        parseDoubleValueFromShortDescription(requestedCoverage.getLimit()),
        parseDoubleValueFromShortDescription(requestedCoverage.getDeductible())
    };

    // Sort by limit first, then deductible
    List<CoverageRecord> sortedList = sortNonRejectedValidCoveragesAsc(validCoverages);

    // Find first where BOTH limit >= requested AND deductible >= requested
    for (CoverageRecord validCoverage : sortedList) {
        double[] currentValues = new double[] {
            parseDoubleValueFromShortDescription(validCoverage.getLimit()),
            parseDoubleValueFromShortDescription(validCoverage.getDeductible())
        };

        if (isValidCoverageHigherThanRequested(currentValues, parsedInputLimitAndDeductible)) {
            return validCoverage;
        }
    }

    return sortedList.get(sortedList.size() - 1);
}
```

---

## 7. The Factory Pattern: Choosing the Right Matcher

### File: `coveragematchers/CoverageMatcherFactory.java`

The factory pattern lets us select the correct matcher based on coverage type and state.

```java
// CoverageMatcherFactory.java - Complete Implementation

@NoArgsConstructor(access = AccessLevel.PRIVATE)
public class CoverageMatcherFactory {

    // Singleton instances of each matcher
    private static final SingleLimitNoDeductibleCoverageMatcher
        SINGLE_LIMIT_NO_DEDUCTIBLE_COVERAGE_MATCHER = new SingleLimitNoDeductibleCoverageMatcher();

    private static final SingleLimitSingleDeductibleCoverageMatcher
        SINGLE_LIMIT_SINGLE_DEDUCTIBLE_COVERAGE_MATCHER = new SingleLimitSingleDeductibleCoverageMatcher();

    private static final TwoLimitNoDeductibleCoverageMatcher
        TWO_LIMIT_NO_DEDUCTIBLE_COVERAGE_MATCHER = new TwoLimitNoDeductibleCoverageMatcher();

    private static final NoLimitSingleDeductibleCoverageMatcher
        NO_LIMIT_SINGLE_DEDUCTIBLE_COVERAGE_MATCHER = new NoLimitSingleDeductibleCoverageMatcher();

    // Coverage type → Matcher mapping
    private static final Map<String, ICoverageMatcher> COVERAGE_MATCHER_MAP = new HashMap<>();

    static {
        // TWO LIMITS (split limits like 100/300)
        COVERAGE_MATCHER_MAP.put("BI", TWO_LIMIT_NO_DEDUCTIBLE_COVERAGE_MATCHER);
        COVERAGE_MATCHER_MAP.put("UMBI", TWO_LIMIT_NO_DEDUCTIBLE_COVERAGE_MATCHER);

        // SINGLE LIMIT (one number like 50000)
        COVERAGE_MATCHER_MAP.put("PD", SINGLE_LIMIT_NO_DEDUCTIBLE_COVERAGE_MATCHER);
        COVERAGE_MATCHER_MAP.put("MED", SINGLE_LIMIT_NO_DEDUCTIBLE_COVERAGE_MATCHER);
        COVERAGE_MATCHER_MAP.put("PIP", SINGLE_LIMIT_NO_DEDUCTIBLE_COVERAGE_MATCHER);
        COVERAGE_MATCHER_MAP.put("RR", SINGLE_LIMIT_NO_DEDUCTIBLE_COVERAGE_MATCHER);
        COVERAGE_MATCHER_MAP.put("UIM", SINGLE_LIMIT_NO_DEDUCTIBLE_COVERAGE_MATCHER);
        COVERAGE_MATCHER_MAP.put("LOSTEARNINGS", SINGLE_LIMIT_NO_DEDUCTIBLE_COVERAGE_MATCHER);
        COVERAGE_MATCHER_MAP.put("ADB", SINGLE_LIMIT_NO_DEDUCTIBLE_COVERAGE_MATCHER);
        COVERAGE_MATCHER_MAP.put("MED-BEN", SINGLE_LIMIT_NO_DEDUCTIBLE_COVERAGE_MATCHER);

        // DEDUCTIBLE ONLY (like COMP/COLL)
        COVERAGE_MATCHER_MAP.put("COMP", NO_LIMIT_SINGLE_DEDUCTIBLE_COVERAGE_MATCHER);
        COVERAGE_MATCHER_MAP.put("COLL", NO_LIMIT_SINGLE_DEDUCTIBLE_COVERAGE_MATCHER);

        // LIMIT + DEDUCTIBLE (UMPD default)
        COVERAGE_MATCHER_MAP.put("UMPD", SINGLE_LIMIT_SINGLE_DEDUCTIBLE_COVERAGE_MATCHER);

        // ╔══════════════════════════════════════════════════════════════════╗
        // ║  STATE-SPECIFIC OVERRIDES                                        ║
        // ║  Some states have different UMPD formats                         ║
        // ╚══════════════════════════════════════════════════════════════════╝
        COVERAGE_MATCHER_MAP.put("MS-UMPD", SINGLE_LIMIT_NO_DEDUCTIBLE_COVERAGE_MATCHER);
        COVERAGE_MATCHER_MAP.put("IN-UMPD", SINGLE_LIMIT_NO_DEDUCTIBLE_COVERAGE_MATCHER);
        COVERAGE_MATCHER_MAP.put("CA-UMPD", SINGLE_LIMIT_NO_DEDUCTIBLE_COVERAGE_MATCHER);
        COVERAGE_MATCHER_MAP.put("TN-UMPD", SINGLE_LIMIT_NO_DEDUCTIBLE_COVERAGE_MATCHER);
        COVERAGE_MATCHER_MAP.put("OR-UMPD", SINGLE_LIMIT_NO_DEDUCTIBLE_COVERAGE_MATCHER);
    }

    /**
     * Get the appropriate matcher for a coverage type.
     * Checks for state-specific override first.
     */
    public static ICoverageMatcher getMatcher(String mnemonic, String requestedStateCode) {
        // Try state-specific key first: "TX-UMPD"
        String stateSpecificKey = String.join("-",
            requestedStateCode.toUpperCase(),
            mnemonic.toUpperCase());

        if (!requestedStateCode.isBlank()
            && COVERAGE_MATCHER_MAP.containsKey(stateSpecificKey)) {
            return COVERAGE_MATCHER_MAP.get(stateSpecificKey);
        }

        // Fall back to general key: "UMPD"
        return COVERAGE_MATCHER_MAP.get(mnemonic.toUpperCase());
    }
}
```

**Why State-Specific Overrides?**

In most states, UMPD has format "limit/deductible" (e.g., "25000/500").
But in Mississippi, Indiana, California, Tennessee, and Oregon, UMPD only has a limit, no deductible.

So for California UMPD, the factory returns `SingleLimitNoDeductibleCoverageMatcher` instead of `SingleLimitSingleDeductibleCoverageMatcher`.

---

## 8. SAPI Integration: Sending to the Backend

### File: `orchestrator/CoverageIngestionQuoteOrchestrator.java` (Lines 140-197)

After matching, we send to SAPI:

```java
// CoverageIngestionQuoteOrchestrator.java - SAPI Flow

private GeicoApplicationsBusinessSaaSDomainDtoInterfacesQuoteResponse
    processSapiCoverageIngestionQuoteOrRecall(
        SapiBaseRequest request,
        CoveragePackages partnerRequestedCoveragePackages,  // Matched coverages
        PartnerProperties partnerProperties,
        boolean isRecall) {

    GeicoApplicationsBusinessSaaSDomainDtoInterfacesSalesRequest saveRequest;

    if (isRecall) {
        // ╔═══════════════════════════════════════════════════════════════╗
        // ║  RECALL PATH: Customer returning to existing quote            ║
        // ╚═══════════════════════════════════════════════════════════════╝

        // Step 1: Recall existing quote
        RecallRequest recallRequest = SapiRequestMapper.toRecallRequest(request, partnerProperties);
        RecallResponse recallResponse = sapi.recall(recallRequest);
        handleSapiError(SapiResponseMapper.sapiResponseToSapiErrorResponse(recallResponse));

        // Step 2: Create save request from recalled data
        saveRequest = SapiRequestMapper.toSaveRecallRequest(request, recallResponse);

    } else {
        // ╔═══════════════════════════════════════════════════════════════╗
        // ║  NEW QUOTE PATH: Brand new customer                           ║
        // ╚═══════════════════════════════════════════════════════════════╝

        // Step 1: Initialize new session
        InitializeRequest initRequest = SapiRequestMapper.toInitializeRequest(request, partnerProperties);
        InitializeResponse initResponse = sapi.init(initRequest, false);
        handleSapiError(SapiResponseMapper.sapiResponseToSapiErrorResponse(initResponse));

        // Step 2: Create save request from init response
        saveRequest = SapiRequestMapper.toSaveRequest(request, initResponse);
    }

    // ╔═══════════════════════════════════════════════════════════════╗
    // ║  COMMON PATH: Save and Quote                                   ║
    // ╚═══════════════════════════════════════════════════════════════╝

    // Step 3: Save customer/vehicle data
    SalesResponse saveResponse = sapi.save(saveRequest);
    handleSapiError(SapiResponseMapper.sapiResponseToSapiErrorResponse(saveResponse));

    // Step 4: Quote with coverage packages
    QuoteRequest coverageIngestionQuoteRequest =
        SapiRequestMapper.toCoverageIngestionQuoteRequest(
            saveResponse,
            partnerRequestedCoveragePackages);  // Our matched coverages!

    QuoteResponse quoteResponse = sapi.quote(coverageIngestionQuoteRequest);

    // Handle errors (but allow partial success)
    handleSapiQuoteError(
        SapiResponseMapper.sapiResponseToSapiErrorResponse(quoteResponse),
        quoteResponse);

    // Track metrics
    if (partnerRequestedCoveragePackages != null) {
        int outputCount = quoteResponse.getCoveragePackages() != null
            ? quoteResponse.getCoveragePackages().getPackages().size()
            : 0;
        CoverageIngestionMetricUtil.markCoveragePackageOutput(outputCount);
    }

    return quoteResponse;
}
```

**SAPI Call Sequence:**
```
NEW QUOTE:      Init → Save → Quote
RECALL:         Recall → Save → Quote
```

---

## 9. Response Mapping: Completing the Circle

After SAPI returns, we map the response back to partner format:

```java
// Called in orchestrator:
return CoverageIngestionResponseMapper.toLegacyPersonalAutoQuoteWithCoverageIngestionResponse(
    coverageQuoteResponse,
    legacyRequest,
    partnerTrackingId,
    requestStateCode,
    featureFlagConfig);
```

**The response includes:**
- Quote ID and recall key
- Premium amounts
- Coverage packages with prices
- Each coverage option with its limit, deductible, and premium

---

## 10. Complete Flow Diagram: Putting It All Together

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COMPLETE COVERAGE INGESTION FLOW                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ STEP 1: REQUEST ARRIVES                                               │   │
│  │ V1Controller.postQuote()                                              │   │
│  │   • Validates request body                                            │   │
│  │   • Gets partner properties                                           │   │
│  │   • Calls orchestrator                                                │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ STEP 2: VALIDATION                                                    │   │
│  │ CoverageIngestionQuoteOrchestrator.personalAutoCoverageIngestionQuote│   │
│  │   • Check request not null                                            │   │
│  │   • Check mailing address exists                                      │   │
│  │   • ZipStateCodeUtil.isRegionAllowed()                               │   │
│  │     - Feature flag checks (emergency blocks)                         │   │
│  │     - Partner-specific blocks                                         │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ STEP 3: LOAD AVAILABLE COVERAGES                                      │   │
│  │ CoveragesDataService.getAvailableStateCoverageData()                 │   │
│  │   • Validate state exists                                             │   │
│  │   • Return Map<CoverageType, List<CoverageRecord>>                   │   │
│  │                                                                       │   │
│  │   Example for Texas:                                                  │   │
│  │   { "BI" → [30/60, 50/100, 100/300, 250/500],                       │   │
│  │     "COMP" → [100, 250, 500, 1000],                                  │   │
│  │     "PD" → [25000, 50000, 100000],                                   │   │
│  │     ... }                                                             │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ STEP 4: COVERAGE MATCHING                                             │   │
│  │ CoverageMatchUtil.matchCoverages()                                   │   │
│  │                                                                       │   │
│  │   For each package:                                                   │   │
│  │     For each coverage:                                                │   │
│  │       │                                                               │   │
│  │       ├─► Get available options for coverage type                    │   │
│  │       │                                                               │   │
│  │       ├─► TRY EXACT MATCH                                            │   │
│  │       │   tryMatchToExactCoverage()                                  │   │
│  │       │   Compare "limit/deductible" strings                         │   │
│  │       │                                                               │   │
│  │       └─► IF NO EXACT MATCH: TRY NEXT HIGHER                         │   │
│  │           tryMatchToNextHigherCoverage()                             │   │
│  │           │                                                           │   │
│  │           ├─► CoverageMatcherFactory.getMatcher()                    │   │
│  │           │   Select matcher based on coverage type + state          │   │
│  │           │                                                           │   │
│  │           └─► matcher.matchCoverage()                                │   │
│  │               Sort options ascending                                  │   │
│  │               Find first option >= requested                         │   │
│  │                                                                       │   │
│  │   Result: CoveragePackages with matched values                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ STEP 5: SAPI CALLS                                                    │   │
│  │ processSapiCoverageIngestionQuoteOrRecall()                          │   │
│  │                                                                       │   │
│  │   NEW QUOTE:                     RECALL:                              │   │
│  │   ┌─────────────┐               ┌─────────────┐                       │   │
│  │   │ sapi.init() │               │sapi.recall()│                       │   │
│  │   └──────┬──────┘               └──────┬──────┘                       │   │
│  │          │                             │                              │   │
│  │          └──────────┬──────────────────┘                              │   │
│  │                     ▼                                                 │   │
│  │              ┌─────────────┐                                          │   │
│  │              │ sapi.save() │  ← Save customer/vehicle data           │   │
│  │              └──────┬──────┘                                          │   │
│  │                     ▼                                                 │   │
│  │              ┌─────────────┐                                          │   │
│  │              │ sapi.quote()│  ← Request with matched coverage pkgs   │   │
│  │              └─────────────┘                                          │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ STEP 6: RESPONSE MAPPING                                              │   │
│  │ CoverageIngestionResponseMapper.toLegacy...Response()                │   │
│  │   • Extract quote details                                             │   │
│  │   • Map premiums                                                      │   │
│  │   • Format coverage packages with prices                             │   │
│  │   • Add recall key for future recalls                                │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ STEP 7: RETURN TO PARTNER                                             │   │
│  │ HTTP 200 with PersonalAutoQuoteCoverageIngestionResponse             │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 11. Code Reference Quick Guide

### Key Files and Their Line Numbers

| Component | File | Key Lines |
|-----------|------|-----------|
| **Entry Point** | `V1Controller.java` | 122-135 |
| **Main Orchestrator** | `CoverageIngestionQuoteOrchestrator.java` | 54-198 |
| **Data Service** | `CoveragesDataService.java` | 33-84 |
| **Main Matcher** | `CoverageMatchUtil.java` | 178-486 |
| **Exact Match** | `CoverageMatchUtil.java` | 375-418 |
| **Next Higher Match** | `CoverageMatchUtil.java` | 452-481 |
| **Matcher Factory** | `CoverageMatcherFactory.java` | 72-82 |
| **Two-Limit Matcher** | `TwoLimitNoDeductibleCoverageMatcher.java` | 27-101 |
| **Single-Limit Matcher** | `SingleLimitNoDeductibleCoverageMatcher.java` | 28-96 |
| **Deductible Matcher** | `NoLimitSingleDeductibleCoverageMatcher.java` | 28-97 |
| **Limit+Ded Matcher** | `SingleLimitSingleDeductibleCoverageMatcher.java` | 27-113 |
| **Parse Helper** | `CoverageMatchParseHelper.java` | 16-38 |
| **Comparison Helper** | `CoverageMatchComparisonHelper.java` | 20-38 |

### Coverage Type to Matcher Mapping

| Coverage | Matcher | Format Example |
|----------|---------|----------------|
| BI | TwoLimitNoDeductible | "100/300" |
| UMBI | TwoLimitNoDeductible | "50/100" |
| PD | SingleLimitNoDeductible | "50000" |
| MED | SingleLimitNoDeductible | "5000" |
| PIP | SingleLimitNoDeductible | "10000" |
| RR | SingleLimitNoDeductible | "30/900" |
| UIM | SingleLimitNoDeductible | "100000" |
| COMP | NoLimitSingleDeductible | "500" |
| COLL | NoLimitSingleDeductible | "1000" |
| UMPD | SingleLimitSingleDeductible | "25000/500" |
| UMPD (MS,IN,CA,TN,OR) | SingleLimitNoDeductible | "25000" |

### Special Values

| Value | Meaning |
|-------|---------|
| `"000000"` | No limit exists for this coverage |
| `"0000"` | No deductible |
| `"REJ"` | Coverage declined/rejected |
| `"OMIT FIELD"` | Field not applicable |

---

## Summary

The coverage ingestion system is elegantly designed with clear separation of concerns:

1. **Controller** handles HTTP concerns
2. **Orchestrator** coordinates the workflow
3. **Data Service** provides available coverage data
4. **Match Util** implements the matching algorithm
5. **Factory** selects the appropriate matcher
6. **Matchers** implement type-specific matching logic
7. **SAPI Proxy** handles backend communication

The **Strategy Pattern** (via ICoverageMatcher interface) allows different matching algorithms for different coverage types, while the **Factory Pattern** makes it easy to select the right strategy based on coverage type and state.
