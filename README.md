<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

Healthcare booking API built with NestJS. It currently has profile, booking,
notification, Redis cache, Prisma/MySQL persistence, and an in-process event bus
for service-to-service communication.

## Architecture

```mermaid
flowchart LR
    Client["Client / Browser"] --> Gateway["API Gateway"]
    Gateway --> LoadBalancer["Load Balancer"]
    LoadBalancer --> Controllers["HTTP Controllers"]

    subgraph NestApi["NestJS API"]
        Controllers
        Booking["Booking Service"]
        UserProfile["User Profile Service"]
        PractitionerProfile["Practitioner Profile Service"]
        Notification["Notification Service"]
        Events["EventEmitter<br/>booking.created"]
    end

    Controllers --> Booking
    Controllers --> UserProfile
    Controllers --> PractitionerProfile
    Controllers --> Notification

    Booking -->|"create / update / cancel booking"| MySQL[("MySQL")]
    UserProfile -->|"patient profiles"| MySQL
    PractitionerProfile -->|"doctor profiles"| MySQL
    PractitionerProfile -->|"doctor list cache"| Redis[("Redis")]
    Notification -->|"lookup patient / doctor email"| MySQL
    Notification -->|"send email"| SMTP["SMTP Provider"]

    Booking -->|"emit booking.created"| Events
    Events -->|"mark slot booked"| PractitionerProfile
    Events -->|"notify patient + doctor"| Notification
```

## Booking Event Flow

```mermaid
sequenceDiagram
    actor Client
    participant Booking as Booking Service
    participant MySQL
    participant Events as EventEmitter
    participant Profile as Practitioner Profile Service
    participant Notification as Notification Service
    participant SMTP as SMTP Provider

    Client->>Booking: POST /bookings
    Booking->>MySQL: validate patient, doctor, tag
    Booking->>MySQL: create booking
    Booking-->>Client: booking response
    Booking->>Events: emit booking.created
    Events->>Profile: update doctor openHours.bookedSlots
    Profile->>MySQL: save updated doctor slot data
    Events->>Notification: send booking emails
    Notification->>MySQL: load patient and doctor emails
    Notification->>SMTP: send patient and doctor notifications
```

## Services

```mermaid
flowchart TB
    UserProfile["User Profile Service<br/>/patients"] --> Patients[("patients")]
    PractitionerProfile["Practitioner Profile Service<br/>/doctors"] --> Doctors[("doctors")]
    PractitionerProfile --> Redis[("Redis doctor cache")]
    Booking["Booking Service<br/>/bookings"] --> Bookings[("bookings")]
    Booking --> Doctors
    Booking --> Patients
    Notification["Notification Service<br/>/notifications/email"] --> Patients
    Notification --> Doctors
```

## Project setup

```bash
$ pnpm install
```

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```
