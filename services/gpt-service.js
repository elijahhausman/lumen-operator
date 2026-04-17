// For colored console logs and event handling
require('colors');
const EventEmitter = require('events');
const OpenAI = require('openai');

class GptService extends EventEmitter {
 // Set up the AI assistant with its initial personality and knowledge
 constructor() {
   super();
   this.openai = new OpenAI();
   this.userContext = [
     // Initial instructions and info for the AI
     { 'role': 'system', 'content': `You are a helpful assistant for Bart's Automotive. 
       Keep your responses brief but friendly. Don't ask more than 1 question at a time. 
       If asked about services not listed below, politely explain we don't offer that service but can refer them to another shop.
       Key Information:
       - Hours: Monday to Friday 9 AM to 5 PM
       - Address: 123 Little Collins Street, Melbourne
       - Services: Car service, brake repairs, transmission work, towing, and general repairs`
     },
     // Welcome message
     { 'role': 'assistant', 'content': 'Welcome to Bart\'s Automotive. • How can I help you today?' },
   ],
   this.partialResponseIndex = 0;    // Tracks pieces of response for order
 }

 // Store the call's unique ID
 setCallSid(callSid) {
   this.userContext.push({ 'role': 'system', 'content': `callSid: ${callSid}` });
 }

 // Add new messages to conversation history
 updateUserContext(name, role, text) {
   if (name !== 'user') {
     this.userContext.push({ 'role': role, 'name': name, 'content': text });
   } else {
     this.userContext.push({ 'role': role, 'content': text });
   }
 }

 // Main function that handles getting responses from GPT
 async completion(text, interactionCount, role = 'user', name = 'user') {
   // Add user's message to conversation history
   this.updateUserContext(name, role, text);

   // Get streaming response from GPT
   const stream = await this.openai.chat.completions.create({
     model: 'gpt-4.1-nano',
     messages: this.userContext,
     stream: true,
   });

   let completeResponse = '';

   for await (const chunk of stream) {
     completeResponse += chunk.choices[0]?.delta?.content || '';
   }

   this.emit('gptreply', {
     partialResponseIndex: this.partialResponseIndex,
     partialResponse: completeResponse,
   }, interactionCount);
   this.partialResponseIndex++;

   // Add GPT's complete response to conversation history
   this.userContext.push({'role': 'assistant', 'content': completeResponse});
   console.log(`GPT -> user context length: ${this.userContext.length}`.green);
 }
}

module.exports = { GptService };