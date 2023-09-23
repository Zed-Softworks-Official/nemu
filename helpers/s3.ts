import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

//import fs from 'fs';

const client = new S3Client({ region: 'us-west-1' });

///////////////////////////////
// AWS Storage Helpers
///////////////////////////////
export enum AWSLocations {
    Default,
    Portfolio,
    Commission,
    Profile,
    Store,
    StoreDownload
}

var AWSLocationEnumToString = (location: AWSLocations) => {
    switch (location) {
        case AWSLocations.Default:
            return 'Default';
        case AWSLocations.Portfolio:
            return 'Portfolio';
        case AWSLocations.Commission:
            return 'Commission';
        case AWSLocations.Profile:
            return 'Profile';
        case AWSLocations.Store:
            return 'Store';
        case AWSLocations.StoreDownload:
            return 'StoreDownload';
    }
}

export var StringToAWSLocationsEnum = (location: string) => {
    location = location.toLocaleLowerCase();
    switch (location) {
        case 'default':
            return AWSLocations.Default;
        case 'portfolio':
            return AWSLocations.Portfolio;
        case 'commission':
            return AWSLocations.Commission;
        case 'profile':
            return AWSLocations.Profile;
        case 'store':
            return AWSLocations.Store;
        case 'storedownload':
            return AWSLocations.StoreDownload;
    }

    return AWSLocations.Default;
}


///////////////////////////////
// As Key
///////////////////////////////
export var AsKey = (handle: string, location: AWSLocations, file_key: string) => {
        return '@' + handle + '/' + AWSLocationEnumToString(location) + '/' + file_key;
}


///////////////////////////////
// Upload File to S3
///////////////////////////////
// export var S3Upload = async (handle: string, location: AWSLocations, file: Express.Multer.File) => {
//     const filestream = fs.createReadStream(file.path);

//     const uploadParams = {
//         Bucket: 'nemuart',
//         Body: filestream,
//         Key: AsKey(handle, location, file.filename)
//     };

//     var command = new PutObjectCommand(uploadParams);
    
//     return await client.send(command);
// };


///////////////////////////////
// Download File to S3
///////////////////////////////
export var S3GetSignedURL = async (handle: string, location: AWSLocations, key: string) => {
    const downloadParams = {
        Bucket: 'nemuart',
        Key: AsKey(handle, location, key)
    }

    var command = new GetObjectCommand(downloadParams);

    return await getSignedUrl(client, command, { expiresIn: 3600 });
};


///////////////////////////////
// Delete File From S3
///////////////////////////////
export var S3Delete = async (handle: string, location: AWSLocations, key: string) => {
    const deleteParams = {
        Bucket: 'nemuart',
        Key: AsKey(handle, location, key)
    }

    var command = new DeleteObjectCommand(deleteParams);

    return await client.send(command);
};