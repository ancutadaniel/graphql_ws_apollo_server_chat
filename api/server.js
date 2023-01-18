import { ApolloServer } from 'apollo-server-express';
import cors from 'cors';
import express from 'express';
import { expressjwt } from 'express-jwt';
import { readFile } from 'fs/promises';
import jwt from 'jsonwebtoken';
import { User } from '../db.js';
import { resolvers } from '../resolvers.js';

import { ApolloServerPluginDrainHttpServer } from 'apollo-server-core';
import * as dotenv from 'dotenv';

// Transition to WebSocket server with graphql-ws
import { makeExecutableSchema } from '@graphql-tools/schema';
import { WebSocketServer } from 'ws';
import { createServer as createHttpServer } from 'http';
import { useServer as useWsServer } from 'graphql-ws/lib/use/ws';

// Load environment variables from .env file
dotenv.config();

// Decode the JWT secret from base64
const JWT_SECRET = Buffer.from(process.env.JWT_SECRET, 'base64');

// Create an Express app
const app = express();
// Add middleware to our Express app
app.use(
  cors(),
  express.json(),
  expressjwt({
    algorithms: ['HS256'],
    credentialsRequired: false,
    secret: JWT_SECRET,
  })
);

app.post('/login', async (req, res) => {
  const { userId, password } = req.body;
  const user = await User.findOne((user) => user.id === userId);
  if (user && user.password === password) {
    const token = jwt.sign({ sub: user.id }, JWT_SECRET);
    res.json({ token });
  } else {
    res.sendStatus(401);
  }
});

// Create a context function that returns the userId from the request HTTP headers
function getHttpContext({ req }) {
  if (req.auth) {
    return { userId: req.auth.sub };
  }
  return {};
}

// Create a context function that returns the token from the connection WebSocket headers
const getWsContext = ({ connectionParams }) => {
  const token = connectionParams?.accessToken;
  if (token) {
    // Verify the token and return the userId
    const payload = jwt.verify(token, JWT_SECRET);
    return { userId: payload.sub };
  }
  return {};
};

// Create an HTTP server and pass our Express
const httpServer = createHttpServer(app);

// Create a WebSocket server and pass our HTTP server
// Extends our HTTP server to accept WebSocket connections
const wsServer = new WebSocketServer({
  server: httpServer,
  path: '/graphql',
});

// Read the schema from a file
const typeDefs = await readFile('./schema.graphql', 'utf8');

// Create a schema that is a GraphQL schema object, that grouped together types and resolvers
const schema = makeExecutableSchema({
  typeDefs,
  resolvers,
});

// Use the WebSocket server to handle GraphQL subscriptions
useWsServer({ schema, context: getWsContext }, wsServer);

const apolloServer = new ApolloServer({
  schema,
  context: getHttpContext,
  plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
});

await apolloServer.start();
apolloServer.applyMiddleware({ app, path: '/graphql' });

httpServer.listen({ port: process.env.PORT }, () => {
  console.log(`Server running on port http://localhost:${process.env.PORT}`);
  console.log(
    `GraphQL endpoint: http://localhost:${process.env.PORT}${apolloServer.graphqlPath}`
  );
});
