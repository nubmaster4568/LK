const express = require('express');
const formidable = require('formidable');
const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Handle POST requests
app.post('/webhook', (req, res) => {
  // Create a new Formidable instance
  const form = new formidable.IncomingForm();

  // Parse the form
  form.parse(req, (err, fields, files) => {
    if (err) {
      console.error('Error parsing form:', err);
      res.status(400).send('Error parsing form');
      return;
    }

    // Extract specific fields
    const addressLabel = fields['address_label'] ? fields['address_label'][0] : 'Not Provided';
    const amount = fields['amount'] ? fields['amount'][0] : 'Not Provided';

    // Log extracted fields
    console.log('Address Label:', addressLabel);
    console.log('Amount:', amount);

    // Respond to indicate successful receipt
    res.status(200).send('Webhook received');
  });
});

// Function to handle webhook events (optional)
// If you want to process events further, implement your logic here
function handleWebhookEvent(event) {
  // Implement your webhook handling logic here
  console.log('Handling event:', event);
  // For example, process the event based on its type or content
  // You might want to interact with a database, call another API, etc.
}

// Start the server
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
