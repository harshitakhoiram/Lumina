# Lumina API Contract

## Authentication

### POST /auth/signup
Request:
{
  "name": "string",
  "email": "string",
  "password": "string"
}

Response:
{
  "access_token": "string",
  "token_type": "bearer",
  "user_id": "uuid"
}

---

## Get Current User

### GET /me
Auth: Required

Response:
{
  "user_id": "uuid"
}

---

## User Profile

### POST /auth/profile
Auth: Required

Request: (any of the onboarding fields)
{
  "fullName": "string",
  "email": "string",
  "interest": "video|books",
  "language": "string",
  "genre": "string",
  "selectedTitles": ["string"],
  "selectedActors": ["string"],
  "favoriteContent": "string",
  "finalConfirmation": true
}

Response:
{
  "status": "profile saved"
}

---

## Content Listing

### GET /content
Query Params:
- type (optional)
- genre (optional)
- q (search term)
- page (int)

Response:
{
  "items": [
    {
      "content_id": "string",
      "title": "string",
      "content_type": "movie | book | series",
      "poster_url": "string",
      "rating": 8.4
    }
  ],
  "total": 100
}

---

## Content Detail

### GET /content/{content_id}

Response:
{
  "content_id": "string",
  "title": "string",
  "description": "string",
  "genres": ["Action", "Drama"],
  "release_date": "YYYY-MM-DD",
  "rating": 8.4,
  "popularity_score": 91.2
}

---

## User Interaction

### POST /interactions

Auth: Required

Request:
{
  "content_id": "string",
  "interaction_type": "like | bookmark | rate",
  "rating_value": 4
}

Response:
{
  "status": "success"
}

---

## Recommendations

### GET /recommendations

Auth: Required

Response:
{
  "items": [
    {
      "content_id": "string",
      "title": "string",
      "poster_url": "string"
    }
  ]
}