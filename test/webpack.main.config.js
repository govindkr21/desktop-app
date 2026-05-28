const fs = require('fs');
const path = require('path');

class CopySerialPortPlugin {
  apply(compiler) {
    compiler.hooks.afterEmit.tap('CopySerialPortPlugin', (compilation) => {
      const outputPath = compiler.options.output.path;
      const destNodeModules = path.join(outputPath, 'node_modules');

      if (!fs.existsSync(destNodeModules)) {
        fs.mkdirSync(destNodeModules, { recursive: true });
      }

      const packagesToCopy = [
        'serialport',
        '@serialport',
        'debug',
        'ms',
        'node-addon-api',
        'node-gyp-build'
      ];

      packagesToCopy.forEach(pkg => {
        const src = path.resolve(__dirname, 'node_modules', pkg);
        const dest = path.join(destNodeModules, pkg);
        if (fs.existsSync(src)) {
          console.log(`[Webpack Plugin] Copying ${pkg} to output node_modules...`);
          fs.cpSync(src, dest, { recursive: true, dereference: true });
        }
      });
    });
  }
}

module.exports = {
  entry: './src/main/index.js',
  externals: {
    serialport: 'commonjs serialport',
  },
  plugins: [
    new CopySerialPortPlugin(),
  ],
  module: {
    rules: [
      {
        test: /native_modules[/\\].+\.node$/,
        use: 'node-loader',
      },
      {
        test: /[/\\]node_modules[/\\].+\.(m?js|node)$/,
        parser: { amd: false },
        use: {
          loader: '@vercel/webpack-asset-relocator-loader',
          options: {
            outputAssetBase: 'native_modules',
          },
        },
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css', '.json'],
  },
};
