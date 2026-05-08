# Application Architecture Diagram

```mermaid
graph TB
    subgraph "Frontend (SPA)"
        FE[Vite + TypeScript SPA]
    end

    subgraph "Backend (Express API)"
        API[Express API Server :3000]
        AUTH[Auth Middleware]
        RL[Rate Limiter]
        ROUTES[Route Handlers]
    end

    subgraph "Services"
        US[User Service]
        RS[Route Service]
        TCS[Trip Cost Service]
        RA[Refuel Advisor]
        VS[Vignette Service]
        FPS[Fuel Price Service]
        ES[Email Service]
        EXP[Route Exporters]
    end

    subgraph "Data Layer"
        PG[(PostgreSQL)]
        REDIS[(Redis Cache)]
    end

    subgraph "External Services"
        GMAPS[Google Maps API]
        SMTP[SMTP Server]
        CIELO[CieloWeb Scraper]
        GPP[GlobalPetrolPrices]
        IVIG[i-vignette.com]
        VINT[vintrica.com]
    end

    subgraph "Background Jobs"
        FPJ[Fuel Price Job - 6h]
        VPJ[Vignette Price Job - 24h]
    end

    FE -->|HTTP/JSON| API
    API --> AUTH
    AUTH --> RL
    RL --> ROUTES

    ROUTES --> US
    ROUTES --> RS
    ROUTES --> TCS
    ROUTES --> RA
    ROUTES --> VS
    ROUTES --> FPS
    ROUTES --> EXP

    US --> PG
    US --> ES
    RS --> PG
    RS --> GMAPS
    TCS --> PG
    TCS --> REDIS
    RA --> PG
    RA --> REDIS
    VS --> PG
    VS --> REDIS
    FPS --> PG
    FPS --> REDIS

    ES -->|SMTP| SMTP
    FPJ --> CIELO
    FPJ --> GPP
    FPJ --> REDIS
    FPJ --> PG
    VPJ --> IVIG
    VPJ --> VINT
    VPJ --> REDIS
    VPJ --> PG
```

## Communication Protocols

| Connection | Protocol | Port |
|-----------|----------|------|
| Frontend → API | HTTP/JSON | 3000 |
| API → PostgreSQL | TCP (pg) | 5432 |
| API → Redis | TCP (redis) | 6379 |
| API → Google Maps | HTTPS | 443 |
| Email Service → SMTP | SMTP/TLS | 587/465 |
| Scrapers → External Sites | HTTPS | 443 |
