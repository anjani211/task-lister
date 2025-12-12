# 14_test: NRTQTE WaitingForReports Testing & Debugging Guide

## Overview

This guide provides step-by-step instructions for testing and debugging the NRTQTE WaitingForReports fix that converts HTTP 400 to HTTP 500 for V1 endpoints.

**Related Spec:** `specs/14_NRTQTE_WaitingForReports_should_be_500.md`

---

## Quick Reference: Files Involved

| File | Role |
|------|------|
| `src/main/java/com/geico/ppmexchangeorchestrator/exception/LegacyExceptionHandler.java` | **Production code** - Exception handler that was modified |
| `src/test/java/com/geico/ppmexchangeorchestrator/exception/LegacyExceptionHandlerTest.java` | **Unit tests** - Tests the handler directly |
| `src/integration-test/java/com/geico/ppmexchangeorchestrator/V1ControllerNrtqteExceptionIT.java` | **Integration tests** - Tests full MVC flow |

---

## The Code Flow

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              REQUEST FLOW                                            │
└─────────────────────────────────────────────────────────────────────────────────────┘

    Client Request
         │
         ▼
┌─────────────────────┐
│   V1Controller      │  ← POST /v1/personal/auto/quote
│   personalAutoQuote │
└─────────────────────┘
         │
         ▼
┌───────────────────────────────────┐
│  CoverageIngestionQuoteOrchestrator│
│  personalAutoCoverageIngestionQuote│
└───────────────────────────────────┘
         │
         ▼
┌─────────────────────┐
│   SapiService       │  ← Calls SAPI API
│   quote()           │
└─────────────────────┘
         │
    SAPI Response
         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│  IF SAPI returns error notices:                               │
│  → SapiResponseHandler throws SapiUpstreamException          │
│  → Exception contains SapiErrorResponse with notices         │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  LegacyExceptionHandler                              │
│                  @ExceptionHandler(SapiUpstreamException.class)     │
│                                                                      │
│  handleSapiException(SapiUpstreamException ex, HttpServletRequest)  │
│                                                                      │
│  1. Extract notices from SapiErrorResponse                          │
│  2. Check isSapiSystemError (noticeType == System)                  │
│  3. Check hasInternalNrtqteError (WaitingForReports, MSG_1_007...)  │ ← THE FIX
│  4. Return 500 if System OR InternalNrtqte, else 400                │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
    Client Response (HTTP 400 or 500)
```

---

## Step-by-Step Testing Guide

### Phase 1: Run Unit Tests

Unit tests directly invoke `LegacyExceptionHandler.handleSapiException()` without Spring MVC.

#### Step 1.1: Run All Unit Tests for LegacyExceptionHandler

```bash
./mvnw test -Dtest=LegacyExceptionHandlerTest
```

**Expected Output:** All tests pass (26 tests)

**Key NRTQTE Tests to Verify:**
```
✓ testHandleSapiException_NrtqteWaitingForReports_Returns500
✓ testHandleSapiException_NrtqteManualFollowUpRequired_Returns500
✓ testHandleSapiException_NrtqteMSG1007_Returns500
✓ testHandleSapiException_NrtqteMSG1006_Returns500
✓ testHandleSapiException_NrtqteCoverageIngestionFF_Returns400
✓ testHandleSapiException_NrtqteNullMessage_Returns400
✓ testHandleSapiException_SystemNoticeInSecondPosition_Returns500
```

#### Step 1.2: Run a Specific Test with Debug Output

```bash
./mvnw test -Dtest=LegacyExceptionHandlerTest#testHandleSapiException_NrtqteWaitingForReports_Returns500 -X
```

#### Step 1.3: If Tests Fail - Debugging

**Common Issue 1: Missing imports**
```bash
./mvnw compile
# Look for errors like: "cannot find symbol: SapiErrorMessageConstants"
```

**Fix:** Ensure these imports exist in `LegacyExceptionHandler.java`:
```java
import com.geico.ppmexchangeorchestrator.constant.notices.SapiErrorCodeConstants;
import com.geico.ppmexchangeorchestrator.constant.notices.SapiErrorMessageConstants;
```

**Common Issue 2: Test assertions fail**
```
Expected: INTERNAL_SERVER_ERROR (500)
Actual: BAD_REQUEST (400)
```

**Debug:** Add print statements to the handler:
```java
// In handleSapiException method, add temporarily:
System.out.println("=== DEBUG: hasInternalNrtqte = " + hasInternalNrtqte);
System.out.println("=== DEBUG: isSapiSystemError = " + isSapiSystemError);
sapiNotices.forEach(n -> System.out.println("Notice: " + n.getMessageId() + " - " + n.getMessage()));
```

---

### Phase 2: Run Integration Tests

Integration tests use `@SpringBootTest` + `MockMvc` to test the full MVC flow including the `@ControllerAdvice` exception handler.

#### Step 2.1: Run Integration Tests

```bash
./mvnw verify -Dit.test=V1ControllerNrtqteExceptionIT
```

**Expected Output:** All tests pass (6 tests)

**Tests:**
```
✓ whenNrtqteWaitingForReports_thenLegacyExceptionHandlerReturns500
✓ whenNrtqteMSG1007_thenLegacyExceptionHandlerReturns500
✓ whenNrtqteMSG1006_thenLegacyExceptionHandlerReturns500
✓ whenNrtqteManualFollowup_thenLegacyExceptionHandlerReturns500
✓ whenNrtqteCoverageFF_thenLegacyExceptionHandlerReturns400
✓ whenNrtqteOtherBusinessError_thenLegacyExceptionHandlerReturns400
```

#### Step 2.2: Run All Integration Tests

```bash
./mvnw verify -DskipUnitTests
```

#### Step 2.3: If Integration Tests Fail - Debugging

**Issue 1: ApplicationContext fails to load**
```
Failed to load ApplicationContext
```

**Check:**
1. Ensure `@ActiveProfiles("testnoauth")` is present
2. Ensure `application-testnoauth.properties` exists

**Issue 2: MockMvc returns unexpected status**

**Debug:** Add `.andDo(print())` to see full response:
```java
mockMvc.perform(post("/v1/personal/auto/quote")...)
    .andDo(print())  // ADD THIS
    .andExpect(status().isInternalServerError());
```

**Issue 3: Exception handler not invoked**

Verify the test uses `@SpringBootTest` + `@AutoConfigureMockMvc` (NOT `@WebMvcTest`):
```java
@SpringBootTest(classes = PartnerOrchestratorApplication.class)
@ActiveProfiles("testnoauth")
@AutoConfigureMockMvc  // REQUIRED for exception handler to be invoked
class V1ControllerNrtqteExceptionIT {
```

---

### Phase 3: Local Manual Testing

#### Step 3.1: Start the Application Locally

```bash
./mvnw spring-boot:run -Dspring-boot.run.profiles=local
```

#### Step 3.2: Use Debug Mode in IDE

**IntelliJ IDEA:**
1. Set breakpoint in `LegacyExceptionHandler.handleSapiException()` at line ~240
2. Run in Debug mode
3. Send a test request that triggers a SAPI exception

**Eclipse:**
1. Right-click project → Debug As → Spring Boot App
2. Set breakpoint in `handleSapiException`

#### Step 3.3: Trace Through the Code

Set breakpoints at these key locations:

1. **Entry point:** `V1Controller.personalAutoQuote()` (line ~55)
2. **Orchestrator:** `CoverageIngestionQuoteOrchestrator.personalAutoCoverageIngestionQuote()`
3. **Exception creation:** `SapiResponseHandler` where `SapiUpstreamException` is thrown
4. **Exception handling:** `LegacyExceptionHandler.handleSapiException()` (line ~183)
5. **The fix:** `hasInternalNrtqteError()` method (line ~196)

---

### Phase 4: Verify Specific Error Scenarios

#### Test Case 1: WaitingForReports → Should Return 500

**SAPI Notice Payload:**
```json
{
  "noticeType": "Business",
  "messageId": "NRTQTE",
  "message": "Id: WaitingForReports, Severity: Error, Description: RatingStatus : WaitingForReports - exhausted retries for application id : 765366fa-a2aa-4606-8161-7c98128a2058",
  "severity": "Error"
}
```

**Expected:** HTTP 500, `statusCode: 500`

**How it's detected:**
```java
// In hasInternalNrtqteError():
message.contains(SapiErrorMessageConstants.WAITING_FOR_REPORTS)  // "WaitingForReports"
```

#### Test Case 2: MSG_1_007 → Should Return 500

**SAPI Notice Payload:**
```json
{
  "noticeType": "Business",
  "messageId": "NRTQTE",
  "message": "Error MSG_1_007 occurred during processing",
  "severity": "Error"
}
```

**Expected:** HTTP 500

**How it's detected:**
```java
message.contains(SapiErrorMessageConstants.MSG_1_007)  // "MSG_1_007"
```

#### Test Case 3: Manual Followup → Should Return 500

**SAPI Notice Payload:**
```json
{
  "noticeType": "Business",
  "messageId": "NRTQTE",
  "message": "An error occurred in the quoting process and a manual follow up will be required.",
  "severity": "Error"
}
```

**Expected:** HTTP 500

**How it's detected:**
```java
SapiErrorMessageConstants.ERROR_OCCURED_MANUAL_FOLLOWUP_REQ.equals(message)
```

#### Test Case 4: Coverage FF Error → Should Return 400

**SAPI Notice Payload:**
```json
{
  "noticeType": "Business",
  "messageId": "NRTQTE",
  "message": "FF331 - PA UM CANNOT EXCEED BI FOR 2012 DODGE DURANGO",
  "severity": "Error"
}
```

**Expected:** HTTP 400 (unchanged - these are valid client errors)

**Why:** Message doesn't match any internal error patterns.

#### Test Case 5: System Notice Type → Should Return 500

**SAPI Notice Payload:**
```json
{
  "noticeType": "System",
  "messageId": "SYS_ERROR",
  "message": "Any system error message",
  "severity": "Error"
}
```

**Expected:** HTTP 500

**How it's detected:**
```java
// In handleSapiException():
notice.getNoticeType() == GeicoApplicationsBusinessSaaSDomainDtoNoticeType.System
```

---

### Phase 5: Code Walkthrough

#### The Key Method: `hasInternalNrtqteError`

**Location:** `LegacyExceptionHandler.java:196-211`

```java
private boolean hasInternalNrtqteError(List<GeicoApplicationsBusinessSaaSDomainDtoNotice> notices) {
  return notices.stream()
      // Step 1: Filter to only NRTQTE notices
      .filter(notice -> NRTQTE.equals(notice.getMessageId()))
      // Step 2: Check if ANY notice has an internal error message
      .anyMatch(notice -> {
        String message = notice.getMessage();
        if (message == null) {
          return false;
        }
        // Step 3: Check for known internal error patterns
        return ERROR_OCCURED_MANUAL_FOLLOWUP_REQ.equals(message)
            || message.contains(MSG_1_007)
            || message.contains(MSG_1_006)
            || message.contains(WAITING_FOR_REPORTS);
      });
}
```

**Logic Flow:**
```
notices.stream()
    │
    ├─► filter(messageId == "NRTQTE")  → Only process NRTQTE notices
    │
    └─► anyMatch(...)  → Return true if ANY NRTQTE notice matches internal error
            │
            ├─► message == "An error occurred...manual follow up..."  → TRUE
            ├─► message.contains("MSG_1_007")                         → TRUE
            ├─► message.contains("MSG_1_006")                         → TRUE
            ├─► message.contains("WaitingForReports")                 → TRUE
            └─► otherwise                                              → FALSE
```

#### The Status Code Decision

**Location:** `LegacyExceptionHandler.java:240-244`

```java
// Check for internal NRTQTE errors (WaitingForReports, MSG_1_007, etc.)
boolean hasInternalNrtqte = hasInternalNrtqteError(sapiNotices);

// Return 500 for System errors OR internal NRTQTE errors
HttpStatus statusCode = (isSapiSystemError || hasInternalNrtqte)
    ? Common.INTERNAL_SERVER_ERROR   // 500
    : Common.BAD_REQUEST;            // 400
```

**Decision Matrix:**
```
┌──────────────────────┬────────────────────┬─────────────────┐
│ isSapiSystemError    │ hasInternalNrtqte  │ HTTP Status     │
├──────────────────────┼────────────────────┼─────────────────┤
│ true                 │ true               │ 500             │
│ true                 │ false              │ 500             │
│ false                │ true               │ 500             │ ← NEW BEHAVIOR
│ false                │ false              │ 400             │
└──────────────────────┴────────────────────┴─────────────────┘
```

---

### Phase 6: Full Test Suite Verification

#### Step 6.1: Run All Tests (Unit + Integration)

```bash
./mvnw clean verify
```

**Expected Output:**
- Unit tests: PASS
- Integration tests: PASS
- Spotless check: PASS
- Build: SUCCESS

#### Step 6.2: If Spotless Fails

```bash
./mvnw spotless:apply
./mvnw verify
```

#### Step 6.3: Check Test Coverage

```bash
./mvnw test jacoco:report
open target/site/jacoco/index.html
```

Verify `LegacyExceptionHandler` has coverage for:
- `handleSapiException()` method
- `hasInternalNrtqteError()` method

---

### Phase 7: Debugging Checklist

If tests fail or behavior is unexpected, check:

- [ ] **1. Imports are correct** in `LegacyExceptionHandler.java`
  ```java
  import com.geico.ppmexchangeorchestrator.constant.notices.SapiErrorCodeConstants;
  import com.geico.ppmexchangeorchestrator.constant.notices.SapiErrorMessageConstants;
  import static com.geico.ppmexchangeorchestrator.constant.notices.SapiErrorCodeConstants.NRTQTE;
  import static com.geico.ppmexchangeorchestrator.constant.notices.SapiErrorMessageConstants.*;
  ```

- [ ] **2. `hasInternalNrtqteError()` method exists** and is called from `handleSapiException()`

- [ ] **3. Status code logic is correct:**
  ```java
  HttpStatus statusCode = (isSapiSystemError || hasInternalNrtqte)
      ? Common.INTERNAL_SERVER_ERROR
      : Common.BAD_REQUEST;
  ```

- [ ] **4. Constants are correct** in `SapiErrorMessageConstants.java`:
  ```java
  public static final String WAITING_FOR_REPORTS = "WaitingForReports";
  public static final String MSG_1_007 = "MSG_1_007";
  public static final String MSG_1_006 = "MSG_1_006";
  public static final String ERROR_OCCURED_MANUAL_FOLLOWUP_REQ =
      "An error occurred in the quoting process and a manual follow up will be required.";
  ```

- [ ] **5. Integration test setup is correct:**
  - Uses `@SpringBootTest` (NOT `@WebMvcTest`)
  - Uses `@AutoConfigureMockMvc`
  - Uses `@ActiveProfiles("testnoauth")`
  - Uses `@MockBean` for `CoverageIngestionQuoteOrchestrator`

---

### Phase 8: Troubleshooting Common Issues

#### Issue: Tests pass locally but fail in CI

**Check:**
1. Maven cache issues: `./mvnw clean verify`
2. Profile differences: Ensure `testnoauth` profile works in CI
3. Port conflicts: Integration tests should use random ports

#### Issue: Exception handler not being invoked

**Symptom:** Test expects 500 but gets 200 or different error

**Root Cause:** `@WebMvcTest` doesn't load full context with `@ControllerAdvice`

**Fix:** Use `@SpringBootTest` + `@AutoConfigureMockMvc`

#### Issue: Mock not being applied

**Symptom:** Real service is called instead of mock

**Root Cause:** `@MockBean` on wrong class or missing

**Fix:** Ensure `@MockBean` is on the correct orchestrator:
```java
@MockBean private CoverageIngestionQuoteOrchestrator coverageIngestionQuoteOrch;
```

#### Issue: Response body assertions fail

**Debug:**
```java
MvcResult result = mockMvc.perform(...)
    .andReturn();

String responseBody = result.getResponse().getContentAsString();
System.out.println("Response: " + responseBody);
```

---

### Phase 9: Complete Test Commands Reference

```bash
# 1. Compile the project
./mvnw compile

# 2. Run only LegacyExceptionHandler unit tests
./mvnw test -Dtest=LegacyExceptionHandlerTest

# 3. Run a specific unit test
./mvnw test -Dtest=LegacyExceptionHandlerTest#testHandleSapiException_NrtqteWaitingForReports_Returns500

# 4. Run only NRTQTE integration tests
./mvnw verify -Dit.test=V1ControllerNrtqteExceptionIT

# 5. Run a specific integration test
./mvnw verify -Dit.test=V1ControllerNrtqteExceptionIT#whenNrtqteWaitingForReports_thenLegacyExceptionHandlerReturns500

# 6. Run all tests (unit + integration)
./mvnw clean verify

# 7. Run with debug output
./mvnw test -Dtest=LegacyExceptionHandlerTest -X

# 8. Fix formatting issues
./mvnw spotless:apply

# 9. Generate test coverage report
./mvnw test jacoco:report
open target/site/jacoco/index.html

# 10. Skip integration tests (unit only)
./mvnw test

# 11. Skip unit tests (integration only)
./mvnw verify -DskipUnitTests
```

---

### Phase 10: Expected Test Results Summary

#### Unit Tests (LegacyExceptionHandlerTest)

| Test | Expected Result |
|------|-----------------|
| `testHandleSapiException_NrtqteWaitingForReports_Returns500` | PASS - HTTP 500 |
| `testHandleSapiException_NrtqteManualFollowUpRequired_Returns500` | PASS - HTTP 500 |
| `testHandleSapiException_NrtqteMSG1007_Returns500` | PASS - HTTP 500 |
| `testHandleSapiException_NrtqteMSG1006_Returns500` | PASS - HTTP 500 |
| `testHandleSapiException_NrtqteCoverageIngestionFF_Returns400` | PASS - HTTP 400 |
| `testHandleSapiException_NrtqteNullMessage_Returns400` | PASS - HTTP 400 |
| `testHandleSapiException_SystemNoticeInSecondPosition_Returns500` | PASS - HTTP 500 |

#### Integration Tests (V1ControllerNrtqteExceptionIT)

| Test | Expected Result |
|------|-----------------|
| `whenNrtqteWaitingForReports_thenLegacyExceptionHandlerReturns500` | PASS - HTTP 500 |
| `whenNrtqteMSG1007_thenLegacyExceptionHandlerReturns500` | PASS - HTTP 500 |
| `whenNrtqteMSG1006_thenLegacyExceptionHandlerReturns500` | PASS - HTTP 500 |
| `whenNrtqteManualFollowup_thenLegacyExceptionHandlerReturns500` | PASS - HTTP 500 |
| `whenNrtqteCoverageFF_thenLegacyExceptionHandlerReturns400` | PASS - HTTP 400 |
| `whenNrtqteOtherBusinessError_thenLegacyExceptionHandlerReturns400` | PASS - HTTP 400 |

---

## Appendix A: Test File Locations

```
src/
├── main/java/com/geico/ppmexchangeorchestrator/
│   ├── controller/
│   │   └── V1Controller.java                    # Entry point for V1 endpoints
│   ├── exception/
│   │   └── LegacyExceptionHandler.java          # THE FILE WITH THE FIX
│   ├── orchestrator/
│   │   └── CoverageIngestionQuoteOrchestrator.java  # Calls SAPI
│   └── constant/notices/
│       ├── SapiErrorCodeConstants.java          # Error codes (NRTQTE)
│       └── SapiErrorMessageConstants.java       # Error messages
│
├── test/java/com/geico/ppmexchangeorchestrator/
│   └── exception/
│       └── LegacyExceptionHandlerTest.java      # UNIT TESTS
│
└── integration-test/java/com/geico/ppmexchangeorchestrator/
    └── V1ControllerNrtqteExceptionIT.java       # INTEGRATION TESTS
```

---

## Appendix B: Before vs After Comparison

### Before the Fix

```java
// Only checked noticeType
HttpStatus statusCode = isSapiSystemError
    ? Common.INTERNAL_SERVER_ERROR
    : Common.BAD_REQUEST;

// WaitingForReports has noticeType: "Business" → returned 400
```

### After the Fix

```java
// Now also checks message content for internal errors
boolean hasInternalNrtqte = hasInternalNrtqteError(sapiNotices);

HttpStatus statusCode = (isSapiSystemError || hasInternalNrtqte)
    ? Common.INTERNAL_SERVER_ERROR
    : Common.BAD_REQUEST;

// WaitingForReports detected by message content → returns 500
```

---

## Appendix C: Quick Verification Script

Create a script to verify all tests pass:

```bash
#!/bin/bash
# File: verify-nrtqte-fix.sh

echo "=== Step 1: Compile ==="
./mvnw compile -q
if [ $? -ne 0 ]; then echo "COMPILE FAILED"; exit 1; fi

echo "=== Step 2: Unit Tests ==="
./mvnw test -Dtest=LegacyExceptionHandlerTest -q
if [ $? -ne 0 ]; then echo "UNIT TESTS FAILED"; exit 1; fi

echo "=== Step 3: Integration Tests ==="
./mvnw verify -Dit.test=V1ControllerNrtqteExceptionIT -q
if [ $? -ne 0 ]; then echo "INTEGRATION TESTS FAILED"; exit 1; fi

echo ""
echo "✅ ALL TESTS PASSED!"
echo ""
echo "Unit tests verified:"
echo "  - NRTQTE WaitingForReports → 500"
echo "  - NRTQTE MSG_1_007 → 500"
echo "  - NRTQTE MSG_1_006 → 500"
echo "  - NRTQTE Manual Followup → 500"
echo "  - NRTQTE FF Coverage Error → 400"
echo ""
echo "Integration tests verified:"
echo "  - Full MVC flow with exception handler"
```

---

## Summary

### Testing Steps at a Glance

1. **Run Unit Tests:** `./mvnw test -Dtest=LegacyExceptionHandlerTest`
2. **Run Integration Tests:** `./mvnw verify -Dit.test=V1ControllerNrtqteExceptionIT`
3. **Run All Tests:** `./mvnw clean verify`
4. **Debug with IDE breakpoints** at `LegacyExceptionHandler.handleSapiException()`
5. **Verify expected behavior:**
   - WaitingForReports → **500**
   - MSG_1_007, MSG_1_006 → **500**
   - Manual Followup → **500**
   - FF Coverage Errors → **400** (unchanged)
