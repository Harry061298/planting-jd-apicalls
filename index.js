const serverless = require("serverless-http");
const express = require("express");
const app = express();
const cors = require("cors");
require('dotenv').config();
const axios = require('axios');

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
var PORT = 4000



const serverUrl = process.env.REACT_APP_SERVER_URL


app.post('/fieldData', async function ({ body }, res, next) {
  console.log("serverUrl :", serverUrl);

  try {
    var mainURL = `${serverUrl}call-api` // url connects with lambda api
    const d = new Date();
    let year = d.getFullYear();

    var url = `https://sandboxapi.deere.com/platform/organizations/${body.orgid}/farms/${body.jdfarmid}/fields`     // url to get the fields
    var workPlanURL = `https://sandboxapi.deere.com/platform/organizations/${body.orgid}/workPlans?year=${year}` // url to get workplans for last year

    body["url"] = url

    // Example of an Axios POST request
    const axiosResponse = await axios.post(mainURL, body); // Replace the URL with your desired endpoint
    // console.log("Axios Response:", axiosResponse.data);

    var jsonData = axiosResponse.data.values;
    var fieldData = axiosResponse.data.values;


    // Initialize an array to store the "boundaries" links
    const boundariesLinks = [];

    // Iterate through the "values" array
    jsonData.forEach(value => {
      // Iterate through the "links" array in each "values" object
      value.links.forEach(link => {
        // Check if the "rel" equals "boundaries"
        if (link.rel === "boundaries") {
          // Add the link to the array
          boundariesLinks.push(link.uri);
        }
      });
    });

    // Initialize an array to store the Axios promises
    const axiosPromises = [];
    const boundariesCombined = [];
    console.log("boundariesLinks", boundariesLinks)
    // Fetch all "boundaries" URIs in parallel using Axios
    boundariesLinks.forEach(uri => {
      var payload = {
        'url': uri,
        'accessToken': body.accessToken,
        'Accept': 'application/vnd.deere.axiom.v3+json',
      };

      // Push the Axios promise into axiosPromises array
      axiosPromises.push(
        axios.post(`${serverUrl}call-api`, payload)
          .then(response => {
            // Process the data from the fetched URI here
            console.log("boundariesLinks API test", response.data);
            let bData = response.data.values[0];
            boundariesCombined.push(bData);
          })
          .catch(error => {
            console.error('Error fetching data:', error);
          })
      );
    });

    // You can use Promise.all() to handle further actions when all fetches are completed
    Promise.all(axiosPromises)
      .then(() => {
        console.log("All fetches completed");
        console.log("boundariesCombined", boundariesCombined);
   
        body["url"] = workPlanURL
        // Example of another Axios POST request after Promise.all resolves
        return axios.post(`${serverUrl}call-api`, body);
      })
      .then(anotherResponse => {
        // Handle the response from the second API call here
        console.log("Response from another API call:.....", anotherResponse.data.values);

        var workplanData = anotherResponse.data.values
        console.log("workplanData...", workplanData);
// filtering the workplan of seeding only 
        var workplan = workplanData.filter(function (item) {
          return item.workType.instanceDomainId === "dtiSeeding";
        });

        console.log("workplan...", workplan);


        for (let i = 0; i < fieldData.length; i++) {
          const fieldId = fieldData[i].id;
          for (let j = 0; j < workplan.length; j++) {
            const fieldUri = workplan[j].location.fieldUri;
            if (fieldUri.includes(fieldId)) {
              const inputUri = workplan[j].operations[0].operationInputs[0].operationProduct.inputUri;
              const cropType = inputUri.split('/').pop();
              fieldData[i].crop = cropType;

              console.log(`Crop Name: ${cropType}`);
              // If you want to break the loop after the first match, use "break;"
            }
          }
        }
        debugger
        console.log(`fieldData :fieldData`, fieldData);
        for (let i = 0; i < fieldData.length; i++) {
          const fieldId = fieldData[i].id;
          const fieldName = fieldData[i].name;
          const fieldCrop = fieldData[i].crop;
          for (let j = 0; j < boundariesCombined.length; j++) {
            if (boundariesCombined[j].name === fieldName) {
              boundariesCombined[j].crop = fieldCrop;
            }
          }
        }
        console.log(`boundariesCombined :boundariesCombined`, boundariesCombined);
        var filterBoundaries = boundariesCombined.filter((value) => value.active == true);

        var resultData = {
          "FieldData": fieldData,
          "Boundaries": filterBoundaries,
          "workplan": workplan
        }
        // Send the response data back to the client
        res.status(200).json(resultData);
      })
      .catch(error => {
        console.error('Error with Promise.all:', error);
        res.status(500).send("Internal Server Error"); // Send an error response back to the client
      });

    // res.status(200).json(axiosResponse.data); // Send the response data back to the client
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Internal Server Error"); // Send an error response back to the client
  }

});


app.get("/", (req, res, next) => {
  return res.status(200).json({
    message: "Hello from root!",
  });
});

app.get("/hello", (req, res, next) => {
  return res.status(200).json({
    message: "Hello from path!",
  });
});


app.get('/time', (req, res) => {
  let timeNow = Date(Date.now());
  return res.status(200).send(timeNow.toString());
});




app.use((req, res, next) => {
  return res.status(404).json({
    error: "Not Found",
  });
});


if (process.env.ENVIRONMENT === 'lambda') {
  module.exports.handler = serverless(app)
} else {
  app.listen(PORT, () => {
    console.log(`Server listening on ${PORT}`);
  });
}