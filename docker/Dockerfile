# Containerized gx-it-proxy - external entry point for inner proxy.
FROM node:10-jessie
EXPOSE 8910
ADD ./package.json package.json
RUN npm install .

CMD ["npm", "run", "it-proxy", "--", "--ip", "0.0.0.0", "--port", "8910", "--verbose"]
