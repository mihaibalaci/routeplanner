# Route Planner Web Platform — AI Assistant Brief

## Role
Act as a senior full-stack engineer and product architect. Provide implementation guidance, code, architecture decisions, and proactive suggestions throughout development.

---

## 1. Product Overview

Build a web-based route planning platform for Europe (all prices in EUR).  
Reference: similar trip cost calculator to https://www.gasbuddy.com/tripcostcalculator

**Target vehicle types:** Motorcycles, Cars, Campers

---

## 2. Core Features

### 2.1 Route Planning
- Google Maps API integration (Directions, Places, Geocoding)
- User sets origin, destination, and multiple intermediate stops
- Real-time dynamic map updates as the user builds/modifies the route
- Full compatibility with Apple Maps and Google Maps

### 2.2 Trip Cost Calculator
- Calculate fuel cost for the planned route based on:
  - Vehicle type and fuel consumption profile (user-configured)
  - Real-time fuel prices along the route
- Fuel price data sources (priority order):
  1. https://cieloweb.com/
  2. https://www.globalpetrolprices.com/gasoline_prices/Europe/
  3. Google Maps (fallback)

### 2.3 Smart Refuel Stops
- Automatically suggest optimal refueling stops based on:
  - Vehicle tank capacity and consumption rate
  - Proximity to the route (prefer off-highway/near-exit stations)
  - Fuel price comparison at nearby stations
- User can accept/reject suggestions; accepted stops are added to the route

### 2.4 Route Export
- Export finalized route in ALL of these formats:
  GPX, ITN, ASC, OV2, BCR, TRK, MPS, FIT

### 2.5 User Accounts & History
- Account-based system (registration, login, profile)
- Persist per-user: route history, saved vehicles, past suggestions
- User vehicle garage (type, fuel type, tank size, avg consumption)

---

## 3. Technical Requirements

### 3.1 Architecture
- API-first design — all functionality exposed via RESTful (or GraphQL) API before any frontend consumes it
- Design for 1 million users scalability from day one

### 3.2 Backend
- Database: PostgreSQL (preferred) or MySQL
- Caching layer: Redis (for fuel prices, route calculations, session data)
- Background jobs for fuel price scraping/updating

### 3.3 Frontend
- Framework: Material Design Lite (MDL)
- Design principles: clean, simple, beautiful UI
- Map renders route changes dynamically in real time (no page reloads)

### 3.4 Mobile
- iOS and Android apps
- Feature parity with web version

---

## 4. Constraints & Preferences

| Item | Requirement |
|------|-------------|
| Region | Europe only (for now) |
| Currency | EUR only |
| Maps API | Google Maps (required) |
| Map compatibility | Apple Maps + Google Maps |
| Frontend framework | MDL (Material Design Lite) |
| Database | PostgreSQL (preferred) or MySQL |
| Caching | Required (Redis recommended) |
| API design | API-first; all features as endpoints |
| Scale target | 1,000,000 users |
| Export formats | GPX, ITN, ASC, OV2, BCR, TRK, MPS, FIT |

---

## 5. Deliverable Expectations

When assisting with this project:
1. Provide architecture diagrams and data models early
2. Suggest improvements and missing features proactively
3. Write production-ready code with comments
4. Flag scalability concerns as they arise
5. Recommend third-party services/libraries where appropriate
