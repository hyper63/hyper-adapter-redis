# The official Redis Docker image
FROM redis:7-alpine

# Copy our config file over
COPY redis.conf .

# Note that in order to read the configuration file, Redis must be
# started with the file path as first argument:
ENTRYPOINT ["redis-server", "./redis.conf"]
