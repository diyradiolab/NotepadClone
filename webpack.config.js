const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin');

module.exports = (_env, argv) => ({
  entry: './src/renderer/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    clean: true,
  },
  target: 'web',
  devtool: argv.mode === 'production' ? 'source-map' : 'eval-source-map',
  module: {
    rules: [
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.ttf$/,
        type: 'asset/resource',
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/renderer/index.html',
      filename: 'index.html',
    }),
    new MonacoWebpackPlugin({
      languages: [
        'javascript', 'typescript', 'css', 'html', 'json', 'xml',
        'markdown', 'python', 'java', 'cpp', 'csharp', 'go',
        'rust', 'ruby', 'php', 'sql', 'yaml', 'shell',
      ],
      features: [
        'accessibilityHelp', 'bracketMatching', 'caretOperations', 'clipboard',
        'codeAction', 'codelens', 'colorPicker', 'comment', 'contextmenu',
        'cursorUndo', 'dnd', 'find', 'folding', 'fontZoom', 'format',
        'gotoLine', 'hover', 'inPlaceReplace', 'indentation', 'inlineHints',
        'linesOperations', 'links', 'multicursor', 'parameterHints',
        'quickCommand', 'quickOutline', 'rename', 'smartSelect',
        'snippets', 'suggest', 'toggleHighContrast', 'toggleTabFocusMode',
        'wordHighlighter', 'wordOperations', 'wordPartOperations',
      ],
    }),
  ],
  externals: {
    'node-pty': 'commonjs node-pty',
  },
  resolve: {
    extensions: ['.js'],
  },
});
