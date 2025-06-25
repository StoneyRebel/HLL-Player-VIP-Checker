#!/bin/bash
echo "Setting up HLL VIP Bot v2.1.0..."

# Create directories
mkdir -p services handlers config utils data logs

# Remove old files
rm -f contest.js crcon.js database.js vipNotifications.js environment.js

# Move constants to config
mv constants.js config/ 2>/dev/null || echo "constants.js not found"

# Move utils if needed
for file in logger.js validators.js rateLimiter.js platformDetector.js permissions.js; do
    if [ -f "$file" ]; then
        mv "$file" utils/
        echo "Moved $file to utils/"
    fi
done

echo "Directory structure ready!"
echo "Now copy the artifact contents to their respective files."
