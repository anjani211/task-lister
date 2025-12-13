# PPMXPO Observability Titan - Onboarding Guide

> A comprehensive guide for new engineers joining the PPM Exchange Orchestrator Observability team.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Directory Structure](#2-directory-structure)
3. [Technology Stack](#3-technology-stack)
4. [Dashboard System](#4-dashboard-system)
5. [Alerting System](#5-alerting-system)
6. [Data Sources & Metrics](#6-data-sources--metrics)
7. [CI/CD Pipeline](#7-cicd-pipeline)
8. [Environments](#8-environments)
9. [Development Workflow](#9-development-workflow)
10. [Key Patterns & Conventions](#10-key-patterns--conventions)
11. [Troubleshooting Guide](#11-troubleshooting-guide)
12. [Onboarding Checklist](#12-onboarding-checklist)
13. [Quick Reference](#13-quick-reference)

---

## 1. Project Overview

### What is PPMXPO-Observability-Titan?

This is an **Observability-as-Code** repository for the PPM Exchange Orchestrator (PPMXPO) service. It manages Grafana dashboards and alerting rules that monitor a Spring Boot application called "Personal Auto Orchestrator" running on Azure Kubernetes Service (AKS).

### Problem Solved

- Provides centralized, version-controlled observability infrastructure
- Enables monitoring of multiple insurance partners, various APIs, and critical infrastructure metrics
- Implements infrastructure-as-code patterns for dashboards and alerting rules
- Allows safe testing in non-production environments before production deployment
- Ensures compliance with production deployment restrictions through CI/CD guards

### The Application Being Monitored

**Personal Auto Orchestrator** is a Spring Boot 3.4.10 microservice that:
- Handles auto insurance quote requests from multiple partners (JERRYAI, INSURIFY, ZEBRA, CREDITKARMA, etc.)
- Exposes REST APIs at endpoints like `/v1/personal/auto/quote`, `/v1/personal/auto/recall`
- Uses Micrometer for metrics instrumentation
- Runs on Azure Kubernetes Service (AKS)

---

## 2. Directory Structure

```
PPMXPO-Observability-Titan/
│
├── observability/                          # Main observability-as-code directory
│   │
│   ├── alerts/                             # Alert definitions
│   │   ├── rule-groups/                    # Rule group definitions (evaluation intervals)
│   │   │   ├── rg_pd_ppmxpo_1hr.jsonnet    # Production: 1-hour evaluation
│   │   │   ├── rg_pd_ppmxpo_15min.jsonnet  # Production: 15-minute evaluation (default)
│   │   │   ├── rg_pd_ppmxpo_10min.jsonnet  # Production: 10-minute evaluation
│   │   │   ├── rg_np_ppmxpo_1min.jsonnet   # Non-prod: 1-minute evaluation
│   │   │   └── config.yaml                 # Rule group folder UID mapping
│   │   │
│   │   └── rules/                          # Individual alert rules
│   │       ├── prod/                       # Production alerts (~32 alerts)
│   │       │   ├── alert_memory_usage.jsonnet
│   │       │   ├── alert_cpu_usage.jsonnet
│   │       │   ├── alert_cpu_throttling.jsonnet
│   │       │   ├── alert_jvm_memory_usage.jsonnet
│   │       │   ├── alert_gc_pause_time.jsonnet
│   │       │   ├── alert_pods_crashloop.jsonnet
│   │       │   ├── alert_pods_count.jsonnet
│   │       │   ├── alert_pods_restart.jsonnet
│   │       │   ├── alert_threads_state.jsonnet
│   │       │   ├── alert_tps_*.jsonnet     # TPS alerts by volume
│   │       │   ├── alert_p95_*.jsonnet     # P95 latency alerts
│   │       │   ├── alert_4xx_*.jsonnet     # 4xx error rate alerts
│   │       │   ├── alert_5xx_partners_uri.jsonnet
│   │       │   ├── alert_cache_failure_rate.jsonnet
│   │       │   ├── alert_apisix_traffic_drop.jsonnet
│   │       │   ├── partner_config.libsonnet # Partner configuration
│   │       │   └── config.yaml
│   │       │
│   │       └── non-prod/                   # Non-production alerts (testing)
│   │           ├── alert_cache_failure.jsonnet
│   │           ├── alert_pods_fail_count.jsonnet
│   │           └── config.yaml
│   │
│   └── dashboards/                         # Dashboard definitions
│       ├── config.yaml                     # Dashboard folder UID mapping
│       ├── PPMXPO_Prod/                    # Production dashboard
│       │   ├── dashboard.jsonnet           # Main dashboard definition
│       │   ├── variables.libsonnet         # Dashboard variables
│       │   └── config.yaml
│       │
│       └── PPMXPO_Sandbox/                 # Sandbox/testing dashboard
│           ├── dashboard.jsonnet
│           ├── variables.libsonnet
│           └── config.yaml
│
├── cicd/                                   # CI/CD pipeline (DO NOT MODIFY MANUALLY)
│   ├── pipeline.yaml                       # Azure DevOps pipeline definition
│   └── configs/                            # Auto-generated config files
│       ├── repository_config.yaml          # Tracks last processed commit
│       ├── alerts/                         # Generated alert UIDs
│       └── dashboards/                     # Generated dashboard UIDs
│
├── spec/                                   # Specification documents
│   ├── 1_ONBOARDING_GUIDE.md              # This document
│   ├── COVERAGE_INGESTION_ERROR_PANELS_SPEC.md
│   └── COVERAGE_INGESTION_OBSERVABILITY_SPEC_V2.md
│
├── static/                                 # Documentation images
│   ├── Example_Alert.png
│   ├── Alert_Firing.png
│   └── Email_Contact_Point.png
│
├── README.md                               # Main documentation and workflow guide
├── setup-obs-as-code.sh                    # Local development setup script
└── .azuredevops/
    └── pull_request_template.md            # PR checklist
```

---

## 3. Technology Stack

### Core Technologies

| Technology | Purpose |
|------------|---------|
| **Jsonnet** | Configuration language for generating Grafana JSON |
| **Grafana** | Dashboards and alerting visualization |
| **Prometheus/Grafana Mimir** | Metrics storage and querying |
| **Azure AKS** | Kubernetes cluster hosting the application |
| **Azure DevOps** | CI/CD pipeline |
| **Spring Boot + Micrometer** | Application metrics instrumentation |

### Grafana Libraries

```jsonnet
// Core library import
local grafonnet = import 'github.com/grafana/grafonnet/gen/grafonnet-latest/main.libsonnet';

// Custom helpers (provided by obs-as-code)
local query = import 'query.libsonnet';
local alert = import 'alert.libsonnet';
local baseDash = import 'baseDashboard.libsonnet';
local panels = import 'panels.libsonnet';
```

### Key URLs

| Resource | URL |
|----------|-----|
| Grafana (Titan) | `https://titan.geicoddc.net` |
| Production Dashboard | `https://titan.geicoddc.net/d/ael4pskprgoowb/ppm-exchange-orchestrator` |
| Alert List | `https://titan.geicoddc.net/alerting/list` |
| Explore (Query Testing) | `https://titan.geicoddc.net/explore` |
| Titan Onboard API | `https://onboard.titan.geico.net/swagger/` |

---

## 4. Dashboard System

### Dashboard Overview

| Dashboard | UID | Purpose | Modifiable From |
|-----------|-----|---------|-----------------|
| **PPMXPO_Prod** | `ael4pskprgoowb` | Live production monitoring | main branch only |
| **PPMXPO_Sandbox** | `belaz3ojyk45ce` | Testing and development | any branch |

### Dashboard Variables (Filters)

The dashboards include these filter variables:

| Variable | Type | Values | Purpose |
|----------|------|--------|---------|
| **Cluster** | Single select | `gze-pdi165-pd1-aks-*`, `gzw-pdi165-pd8-aks-*`, etc. | Filter by AKS cluster |
| **Namespace** | Single select | pd1, pd8, dv1, ut1, lt1 | Filter by K8s namespace |
| **Job** | Single select | ppm-exchange-orchestrator | Filter by service |
| **Partner** | Multi-select | AUTOCOMPLETE, JERRYAI, INSURIFY, ZEBRA, etc. | Filter by insurance partner |
| **Datasource** | Auto-select | azure-metrics-pd, azure-metrics-np | Metrics source |

### Dashboard Panel Rows

1. **K8s Health** (collapsible)
   - Pods By Phase
   - CPU Usage by Pod
   - Memory Usage by Pod
   - CPU Throttling

2. **Request Metrics**
   - Latency by URI
   - Throughput panels

3. **HTTP Error Metrics**
   - 4xx error rates
   - 5xx error rates
   - Error distribution by partner/URI

4. **Coverage Ingestion Metrics**
   - Total requests
   - Distribution by partner
   - Success vs failure rates
   - Error breakdowns

### Dashboard File Anatomy

```jsonnet
// observability/dashboards/PPMXPO_Prod/dashboard.jsonnet

local grafonnet = import 'github.com/grafana/grafonnet/gen/grafonnet-latest/main.libsonnet';
local variables = import 'variables.libsonnet';

// Base dashboard configuration
baseDash.new('PPM Exchange Orchestrator', 'ael4pskprgoowb')

// Add filter variables
+ grafonnet.dashboard.withVariables([
    variables.cluster,
    variables.namespace,
    variables.job,
    variables.partner,
])

// Add panels organized by rows
+ grafonnet.dashboard.withPanels([
    // Row definitions with panels inside
])
```

---

## 5. Alerting System

### Alert Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Alert Lifecycle                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Jsonnet File                                                   │
│   (alert_memory_usage.jsonnet)                                   │
│         │                                                        │
│         ▼                                                        │
│   CI/CD Pipeline                                                 │
│   (Compiles to JSON, applies to Grafana)                        │
│         │                                                        │
│         ▼                                                        │
│   Grafana Alertmanager                                          │
│   (Evaluates at rule group interval)                            │
│         │                                                        │
│         ▼                                                        │
│   Alert Fires (if condition met for pending duration)           │
│         │                                                        │
│         ▼                                                        │
│   Contact Point Notification                                     │
│   (Paging for prod, Email for non-prod)                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Rule Groups (Evaluation Intervals)

| Rule Group | Interval | Environment | Use Case |
|------------|----------|-------------|----------|
| `rg_pd_ppmxpo_15min` | 15 min | Production | Default for most alerts |
| `rg_pd_ppmxpo_10min` | 10 min | Production | Faster detection |
| `rg_pd_ppmxpo_1hr` | 1 hour | Production | Low-frequency checks |
| `rg_np_ppmxpo_1min` | 1 min | Non-prod | Rapid testing |

### Alert Categories

#### Infrastructure & Pod Health
| Alert | Threshold | Description |
|-------|-----------|-------------|
| `alert_memory_usage` | > 80% | Container memory usage |
| `alert_cpu_usage` | > 80% | Container CPU usage |
| `alert_cpu_throttling` | > 15% | CPU throttling percentage |
| `alert_jvm_memory_usage` | > 80% | JVM heap memory |
| `alert_gc_pause_time` | Various | GC pause duration |
| `alert_pods_crashloop` | Any | Pods in CrashLoopBackOff |
| `alert_pods_count` | Various | Pod count anomalies |
| `alert_pods_restart` | Various | Pod restart frequency |

#### Throughput (TPS)
| Alert | Target | Description |
|-------|--------|-------------|
| `alert_tps_overall` | All | Overall transactions per second |
| `alert_tps_uri` | By URI | TPS breakdown by endpoint |
| `alert_tps_partner_low_volume` | < 1 TPS | Low volume partners |
| `alert_tps_partner_medium_volume` | 1-5000/day | Medium volume partners |
| `alert_tps_partner_high_volume` | > 5000/day | High volume partners |

#### Latency (P95)
| Alert | Endpoint | Threshold |
|-------|----------|-----------|
| `alert_p95_v1_quote_uri` | /v1/personal/auto/quote | 28s |
| `alert_p95_v1_recall_uri` | /v1/personal/auto/recall | Various |
| `alert_p95_legacy_quote_uri` | Legacy quote | Various |
| `alert_p95_lookup_uri` | /api/lookup/** | Various |

#### Error Rates (4xx/5xx)
| Alert | Condition | Description |
|-------|-----------|-------------|
| `alert_4xx_quote_high_traffic` | High volume endpoints | 4xx rate on quote |
| `alert_4xx_quote_low_traffic` | Low volume endpoints | 4xx rate on quote |
| `alert_5xx_partners_uri` | All | 5xx errors by partner/URI |

### Contact Points

| Contact Point | Type | Environment |
|---------------|------|-------------|
| `PPM_ExchangeOrchestrator-Common_Contact_Point` | Paging | Production |
| `PPM_ExchangeOrchestrator-Test_Email_Contact_Point` | Email | Non-prod |

### Alert File Anatomy

```jsonnet
// observability/alerts/rules/prod/alert_memory_usage.jsonnet

local grafonnet = import 'github.com/grafana/grafonnet/gen/grafonnet-latest/main.libsonnet';
local alert = import 'alert.libsonnet';
local query = import 'query.libsonnet';

// Base alert configuration
alert.rule.base(
  "alert_memory_usage",           // Alert name
  "rg_pd_ppmxpo_15min",          // Rule group (15m evaluation)
  "15m",                          // Pending period
  "is_memory_high"                // Condition label
)

// Query and threshold
+ grafonnet.alerting.ruleGroup.rule.withData([
  // Query A: Get memory usage percentage
  alert.rule.baseQuery(
    "ado8qmnol1q80f",             // Datasource UID
    query.metrics("azure", "pd",
      '((sum by(pod, namespace, cluster_name) (container_memory_working_set_bytes{...})) /
        (sum by(pod, namespace, cluster_name) (kube_pod_container_resource_limits{...}))) * 100'
    )
  ),
  // Reduce to last value
  alert.rule.reduce("A", "latest_memory_usage", "last"),
  // Threshold check
  alert.rule.threshold("latest_memory_usage", "is_memory_high", "gt", 80)
])

// Annotations (visible in alert notification)
+ grafonnet.alerting.ruleGroup.rule.withAnnotations({
  "summary": "High memory usage detected for PPMXPO Pods",
  "description": "Memory usage is above 80% for PPMXPO pods",
  "Application Name": "Personal Auto Orchestrator",
  "Environment": "{{ $labels.namespace }}",
  "Cluster": "{{ $labels.cluster_name }}",
})

// Labels (for routing and grouping)
+ grafonnet.alerting.ruleGroup.rule.withLabels({
  "application": "Personal Auto Orchestrator",
  "environment": "{{ $labels.namespace }}",
  "severity": "error"
})

// Contact point
+ alert.rule.withContactPoint("PPM_ExchangeOrchestrator-Common_Contact_Point")
```

---

## 6. Data Sources & Metrics

### Metrics Collection Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Metrics Pipeline                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Spring Boot Application                                        │
│   (Personal Auto Orchestrator)                                   │
│         │                                                        │
│         ▼                                                        │
│   Micrometer Instrumentation                                     │
│   (Generates Prometheus-format metrics)                          │
│         │                                                        │
│         ▼                                                        │
│   /actuator/prometheus endpoint                                  │
│   (Exposes metrics for scraping)                                 │
│         │                                                        │
│         ▼                                                        │
│   Prometheus Scraper (on AKS)                                    │
│   (Collects metrics from pods)                                   │
│         │                                                        │
│         ▼                                                        │
│   Grafana Mimir                                                  │
│   (Long-term metrics storage)                                    │
│         │                                                        │
│         ▼                                                        │
│   Grafana Dashboards & Alerts                                    │
│   (Query and visualize)                                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Primary Datasource

| Property | Value |
|----------|-------|
| Type | Grafana Mimir (Prometheus-compatible) |
| UID | `ado8qmnol1q80f` |
| Name | azure-metrics-pd (prod), azure-metrics-np (non-prod) |

### Key Metrics

#### Application Metrics (from Micrometer)

| Metric | Type | Description |
|--------|------|-------------|
| `http_server_requests_seconds_bucket` | Histogram | HTTP request latency distribution |
| `http_server_requests_seconds_count` | Counter | HTTP request count |
| `cache_load_total` | Counter | Cache operation count |
| `jvm_memory_used_bytes` | Gauge | JVM heap memory usage |
| `jvm_threads_*` | Gauge | JVM thread states |
| `process_cpu_usage` | Gauge | Process CPU usage |

#### Infrastructure Metrics (from Kubernetes)

| Metric | Type | Description |
|--------|------|-------------|
| `container_cpu_usage_seconds_total` | Counter | Container CPU time |
| `container_memory_working_set_bytes` | Gauge | Container memory |
| `container_cpu_cfs_throttled_seconds_total` | Counter | CPU throttling |
| `kube_pod_status_phase` | Gauge | Pod lifecycle status |
| `kube_pod_container_resource_limits` | Gauge | Pod resource limits |

### Custom Labels

Labels allow filtering and grouping in queries:

| Label | Source | Example Values |
|-------|--------|----------------|
| `uri` | Application | `/v1/personal/auto/quote`, `/api/lookup/**` |
| `method` | Application | GET, POST, PATCH |
| `status` | Application | 200, 400, 500 |
| `partnerId` | Application | JERRYAI, INSURIFY, ZEBRA |
| `cluster_name` | Kubernetes | gze-pdi165-pd1-aks-ppsst5-001 |
| `namespace` | Kubernetes | pd1, pd8, dv1 |
| `pod` | Kubernetes | ppm-exchange-orchestrator-xxx |

---

## 7. CI/CD Pipeline

### Pipeline Overview

The Azure DevOps pipeline automatically:
1. Detects changes to observability files
2. Compiles Jsonnet to JSON
3. Applies changes to Grafana via API
4. Auto-commits generated UIDs back to repo

### Pipeline Stages

```
┌─────────────────────────────────────────────────────────────────┐
│                    Pipeline Stages                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Stage 1: setUp                                                 │
│   ├── Checkout code                                              │
│   ├── Determine changed files                                    │
│   ├── Filter excluded paths on feature branches                  │
│   └── Save file list to repository_config.yaml                   │
│                                                                  │
│   Stage 2: manageDashboards                                      │
│   ├── Download grafonnet library                                 │
│   ├── Run DashboardManager.py                                    │
│   │   ├── Compile Jsonnet to JSON                                │
│   │   ├── Validate JSON structure                                │
│   │   └── Apply to Grafana via API                               │
│   └── Auto-commit generated UIDs                                 │
│                                                                  │
│   Stage 3: manageAlerts                                          │
│   ├── Download grafonnet library                                 │
│   ├── Run AlertingManager.py                                     │
│   │   ├── Compile Jsonnet to JSON                                │
│   │   ├── Validate PromQL queries                                │
│   │   └── Apply to Grafana via API                               │
│   └── Auto-commit generated UIDs                                 │
│                                                                  │
│   Stage 4: cleanUp                                               │
│   └── Remove temporary diff tracking                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Branch Protection Rules

| Path | Feature Branches | Main Branch |
|------|------------------|-------------|
| `observability/alerts/rules/prod/*` | BLOCKED | Allowed |
| `observability/alerts/rule-groups/*` | BLOCKED | Allowed |
| `observability/dashboards/PPMXPO_Prod/*` | BLOCKED | Allowed |
| `observability/alerts/rules/non-prod/*` | Allowed | Allowed |
| `observability/dashboards/PPMXPO_Sandbox/*` | Allowed | Allowed |

### Service Account

| Property | Value |
|----------|-------|
| Name | `srv_ppmxpo-PPM_ExchangeOrchestrator` |
| Login | `sa-1-srv_ppmxpo-ppm_exchangeorchestrator` |
| Token ID | `srv_ppmxpo_token` |
| Service Account ID | `7284` |

---

## 8. Environments

### Environment Matrix

| Environment | Cluster | Namespace | Dashboard | Alerts | Purpose |
|-------------|---------|-----------|-----------|--------|---------|
| **Production** | gze-pdi165-pd1-aks-*, gzw-pdi165-pd8-aks-* | pd1, pd8 | PPMXPO_Prod | prod/* | Live traffic |
| **Non-Prod** | azure-eastus-st-149-np-aks-003 | dv1 | PPMXPO_Sandbox | non-prod/* | Testing |
| **Load Test** | gze-lti165-lt1-aks-ppsst5-001 | lt1 | PPMXPO_Prod | prod/* | Performance |

### Active Partners

Currently monitored insurance partners:
- AUTOCOMPLETE
- JERRYAI
- INSURIFY
- ZEBRA
- SMARTFINANCIAL
- COVERAGEDOTCOM
- POLLYV2
- SOFI
- INTHECAR
- EMBEDDED
- CARVANA
- KIKOFF
- CREDITKARMA
- EXPERIAN

---

## 9. Development Workflow

### Standard Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                Development Workflow                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   1. Create Feature Branch                                       │
│      git checkout -b feature/my-change                           │
│                                                                  │
│   2. Make Changes                                                │
│      - Modify files in observability/dashboards/PPMXPO_Sandbox   │
│      - Or observability/alerts/rules/non-prod                    │
│                                                                  │
│   3. Test Locally (Optional)                                     │
│      jsonnet observability/dashboards/PPMXPO_Sandbox/dashboard.jsonnet │
│                                                                  │
│   4. Push and Create PR                                          │
│      git push origin feature/my-change                           │
│      - Pipeline runs, applies to Sandbox                         │
│                                                                  │
│   5. Validate in Grafana                                         │
│      - Check Sandbox dashboard                                   │
│      - Test queries in Explore                                   │
│                                                                  │
│   6. Promote to Production                                       │
│      - Copy changes to PPMXPO_Prod or prod alerts                │
│      - Update PR description                                     │
│      - Merge to main                                             │
│                                                                  │
│   7. Verify Production                                           │
│      - Check Prod dashboard                                      │
│      - Confirm alerts are active                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Testing PromQL Queries

1. Go to `https://titan.geicoddc.net/explore`
2. Select datasource: `azure-metrics-pd` or `azure-metrics-np`
3. Enter your PromQL query
4. Validate results before adding to dashboard/alert

### Common Query Patterns

```promql
# Rate calculation (for counters)
rate(http_server_requests_seconds_count{uri="/v1/personal/auto/quote"}[5m])

# Histogram percentile (P95 latency)
histogram_quantile(0.95,
  sum by(le, uri) (
    rate(http_server_requests_seconds_bucket{uri="/v1/personal/auto/quote"}[5m])
  )
)

# Error rate calculation
sum(rate(http_server_requests_seconds_count{status=~"4.."}[5m]))
/
sum(rate(http_server_requests_seconds_count[5m])) * 100

# Memory usage percentage
(container_memory_working_set_bytes / kube_pod_container_resource_limits) * 100
```

---

## 10. Key Patterns & Conventions

### Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Alert files | `alert_[feature]_[metric].jsonnet` | `alert_memory_usage.jsonnet` |
| Rule groups | `rg_[env]_[app]_[interval].jsonnet` | `rg_pd_ppmxpo_15min.jsonnet` |
| Dashboards | `PPMXPO_[Environment]` | `PPMXPO_Prod`, `PPMXPO_Sandbox` |

### Alert Design Principles

1. **Multi-layered Detection**
   - Infrastructure (CPU, memory, pods)
   - Application (latency, throughput, errors)
   - Business (cache failures, specific error types)

2. **Traffic-Aware Thresholds**
   - Different rules for high/medium/low traffic
   - Prevents false positives on low-volume endpoints

3. **Dynamic Context**
   - Include labels from query (pod, partner, URI)
   - Enables faster diagnosis

4. **Pending Periods**
   - 15m default, 30m for noisy metrics
   - Prevents noise from transient issues

### Dashboard Design Principles

1. **Hierarchical Organization**
   - Collapsible rows by concern area
   - Users focus on relevant sections

2. **Consistent Variables**
   - Same filters across all dashboards
   - Cluster, Namespace, Partner always available

3. **Threshold Visualization**
   - Color thresholds at alert trigger points
   - Visual warning before alerts fire

---

## 11. Troubleshooting Guide

### Pipeline Failures

**Dashboard Errors:**
1. Check `manageDashboards` stage → `Run script to manage dashboards` logs
2. Look for: Jsonnet syntax errors, invalid PromQL, missing datasources

**Alert Errors:**
1. Check `manageAlerts` stage → `Run script to manage alerts` logs
2. Look for: Jsonnet syntax, invalid thresholds, missing contact points

**Force Full Rerun:**
- Use `remakeAll=true` parameter if caching suspected

### Alert Issues

**Alert Not Firing:**
1. Check rule group is active (not paused)
2. Verify PromQL returns data in Explore
3. Check pending period hasn't been exceeded
4. Verify contact point is configured

**Alert Firing Incorrectly:**
1. Test query in Explore with same time range
2. Check threshold value
3. Review pending period
4. Consider traffic volume conditions

### Dashboard Issues

**Panel Not Showing Data:**
1. Check datasource is correct
2. Verify PromQL in panel edit mode
3. Check time range
4. Verify labels exist in metrics

---

## 12. Onboarding Checklist

### Week 1: Orientation

- [ ] Read this onboarding guide completely
- [ ] Read the main `README.md` file
- [ ] Access Grafana Titan: `https://titan.geicoddc.net`
- [ ] Open the Production dashboard and explore all panels
- [ ] Open the Alert list and review 3-5 alerts
- [ ] Set up local development: run `./setup-obs-as-code.sh`

### Week 2: Deep Dive

- [ ] Read `APP_TO_OBSERVABILITY_MAPPING.md` (understand where metrics come from)
- [ ] Trace one alert from `.jsonnet` file to live Grafana
- [ ] Test a PromQL query in Grafana Explore
- [ ] Understand the CI/CD pipeline by reading `cicd/pipeline.yaml`
- [ ] Review the PR template in `.azuredevops/pull_request_template.md`

### Week 3: First Contribution

- [ ] Create a feature branch
- [ ] Make a small change to Sandbox dashboard
- [ ] Create a PR and observe the pipeline
- [ ] Verify your change in Grafana Sandbox dashboard
- [ ] (Optional) Promote change to Prod with team review

### Week 4: Operations

- [ ] Understand alert silencing procedures
- [ ] Know when to use `.withIsPaused()` for testing
- [ ] Review emergency hour workflow in README
- [ ] Add your email to non-prod contact point for testing

---

## 13. Quick Reference

### Key File Locations

| Purpose | Path |
|---------|------|
| Production Dashboard | `observability/dashboards/PPMXPO_Prod/dashboard.jsonnet` |
| Sandbox Dashboard | `observability/dashboards/PPMXPO_Sandbox/dashboard.jsonnet` |
| Production Alerts | `observability/alerts/rules/prod/*.jsonnet` |
| Non-prod Alerts | `observability/alerts/rules/non-prod/*.jsonnet` |
| Rule Groups | `observability/alerts/rule-groups/*.jsonnet` |
| Partner Config | `observability/alerts/rules/prod/partner_config.libsonnet` |
| Pipeline Definition | `cicd/pipeline.yaml` |

### Important UIDs

| Resource | UID |
|----------|-----|
| Production Dashboard | `ael4pskprgoowb` |
| Sandbox Dashboard | `belaz3ojyk45ce` |
| Prod Datasource | `ado8qmnol1q80f` |
| Prod Contact Point | `PPM_ExchangeOrchestrator-Common_Contact_Point` |
| Non-prod Contact Point | `felvennj77j7kb` |

### Common Commands

```bash
# Set up local environment
./setup-obs-as-code.sh /path/to/observability

# Compile Jsonnet locally
jsonnet observability/alerts/rules/prod/alert_cpu_usage.jsonnet

# Check git status
git status

# Create feature branch
git checkout -b feature/my-change
```

### Useful Links

| Resource | URL |
|----------|-----|
| Grafana | `https://titan.geicoddc.net` |
| Production Dashboard | `https://titan.geicoddc.net/d/ael4pskprgoowb/ppm-exchange-orchestrator` |
| Alert List | `https://titan.geicoddc.net/alerting/list` |
| Explore | `https://titan.geicoddc.net/explore` |
| Titan Onboard API | `https://onboard.titan.geico.net/swagger/` |

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| Production Alerts | ~32 |
| Non-Prod Alerts | 2 |
| Rule Groups | 4 |
| Dashboards | 2 |
| AKS Clusters | 4 |
| Active Partners | 14 |
| Alert Intervals | 4 (1m, 10m, 15m, 1h) |
| Contact Points | 2 |

---

*Last Updated: December 2025*
*Current Branch: 10910404-coverage-errors*
