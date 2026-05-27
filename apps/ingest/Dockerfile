FROM golang:1.23-alpine AS build
WORKDIR /src
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /out/ingest ./cmd/server

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/ingest /ingest
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/ingest"]
