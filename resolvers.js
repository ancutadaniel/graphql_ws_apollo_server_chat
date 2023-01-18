import { Message } from './db.js';
import { PubSub } from 'graphql-subscriptions';

const pubSub = new PubSub();

function rejectIf(condition) {
  if (condition) {
    throw new Error('Unauthorized');
  }
}

export const resolvers = {
  Query: {
    messages: (_root, _args, { userId }) => {
      rejectIf(!userId);
      return Message.findAll();
    },
  },

  Mutation: {
    addMessage: async (_root, { input }, { userId }) => {
      rejectIf(!userId);
      const message = await Message.create({ from: userId, text: input.text });

      // Publish the MESSAGE_ADDED event with the message as the payload
      pubSub.publish('MESSAGE_ADDED', { messageAdded: message });

      return message;
    },
  },

  // Subscription is a new type of resolver that is used to subscribe to events
  // It is a function that returns an object with a subscribe function
  Subscription: {
    messageAdded: {
      // The subscribe function returns an AsyncIterator
      // The AsyncIterator is used to push events to the client
      // we pass the MESSAGE_ADDED event to the pubsub.asyncIterator function
      subscribe: (_root, _args, { userId }) => {
        console.log('userId', userId);
        rejectIf(!userId);
        return pubSub.asyncIterator('MESSAGE_ADDED');
      },
    },
  },
};
